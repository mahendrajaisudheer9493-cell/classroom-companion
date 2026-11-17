import { Api, GrammyError, HttpError } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import { Prisma, type OutboundMessage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { isQuietHours, nextQuietHoursEnd } from "@/lib/time";

// The outbound queue: EVERY notification is a row here first (quiet hours, retries with backoff,
// restart-safe, no duplicates via dedupeKey). Direct replies to a user's own action may skip it.

export type OutboundPayload = {
  text: string;
  reply_markup?: InlineKeyboardMarkup;
  /** Optional photo/document (Telegram file_id) sent with `text` as its caption, e.g. a doubt photo. */
  media?: { type: "photo" | "document"; fileId: string };
  /** Links the message to domain rows: side effects on send, cleanup on cancel. */
  meta?: { assignmentId?: string; studentAssignmentId?: string; doubtMessageId?: string };
};

export type EnqueueInput = {
  chatId: bigint;
  recipientUserId?: string | null;
  toStudent: boolean;
  kind: string;
  payload: OutboundPayload;
  dedupeKey: string;
  sendAfter?: Date;
};

// The payload is stored as JSON; these two helpers are the only casts between the types.
const toJson = (payload: OutboundPayload) => payload as unknown as Prisma.InputJsonObject;
export const readPayload = (msg: Pick<OutboundMessage, "payload">) => msg.payload as unknown as OutboundPayload;

const MAX_ATTEMPTS = 6;
const CLAIM_MS = 2 * 60_000; // a claimed row is invisible to other senders for 2 minutes

function quietHoursOn(): boolean {
  return getEnv().QUIET_HOURS_ENABLED;
}

/** When a message to this audience may go out: students never during quiet hours (→ next 07:00 IST). */
export function deliveryTime(toStudent: boolean, at: Date = new Date()): Date {
  if (toStudent && quietHoursOn() && isQuietHours(at)) return nextQuietHoursEnd(at).toJSDate();
  return at;
}

/** Inserts a message; a second enqueue with the same dedupeKey is skipped silently. */
export async function enqueue(input: EnqueueInput): Promise<{ queued: boolean; sendAfter: Date }> {
  const sendAfter = deliveryTime(input.toStudent, input.sendAfter ?? new Date());
  const result = await prisma.outboundMessage.createMany({
    data: [
      {
        chatId: input.chatId,
        recipientUserId: input.recipientUserId ?? null,
        toStudent: input.toStudent,
        kind: input.kind,
        payload: toJson(input.payload),
        dedupeKey: input.dedupeKey,
        sendAfter,
      },
    ],
    skipDuplicates: true,
  });
  return { queued: result.count > 0, sendAfter };
}

let api: Api | undefined;
function telegram(): Api {
  api ??= new Api(getEnv().TELEGRAM_BOT_TOKEN);
  return api;
}

/** What happens in the domain once a message is actually delivered. */
async function afterSent(msg: OutboundMessage) {
  const meta = readPayload(msg).meta;
  if (msg.kind === "assignment.new" && meta?.studentAssignmentId) {
    await prisma.studentAssignment.updateMany({
      where: { id: meta.studentAssignmentId, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
  }
  if (msg.kind === "doubt.alert" && meta?.doubtMessageId) {
    await prisma.doubtMessage.updateMany({ where: { id: meta.doubtMessageId, deliveredAt: null }, data: { deliveredAt: new Date() } });
  }
}

async function send(chatId: number, payload: OutboundPayload) {
  const extra = { reply_markup: payload.reply_markup };
  if (payload.media) {
    const caption = payload.text.length > 1000 ? `${payload.text.slice(0, 1000)}…` : payload.text; // Telegram caption limit 1024
    if (payload.media.type === "photo") return telegram().sendPhoto(chatId, payload.media.fileId, { ...extra, caption });
    return telegram().sendDocument(chatId, payload.media.fileId, { ...extra, caption });
  }
  return telegram().sendMessage(chatId, payload.text, { ...extra, link_preview_options: { is_disabled: true } });
}

export type SendSummary = { sent: number; failed: number; dead: number; deferred: number };

/**
 * Sends due PENDING messages, oldest first. Each row is claimed atomically first, so the tick and a
 * webhook calling sendDue at the same time never send the same row twice.
 */
export async function sendDue(limit = 25): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, failed: 0, dead: 0, deferred: 0 };
  const due = await prisma.outboundMessage.findMany({
    where: { status: "PENDING", sendAfter: { lte: new Date() } },
    orderBy: { sendAfter: "asc" },
    take: limit,
  });

  for (const msg of due) {
    const claimed = await prisma.outboundMessage.updateMany({
      where: { id: msg.id, status: "PENDING", sendAfter: msg.sendAfter },
      data: { sendAfter: new Date(Date.now() + CLAIM_MS) },
    });
    if (claimed.count === 0) continue; // someone else took it

    // Re-check quiet hours at send time (the row may have been queued earlier in the day).
    const allowedAt = deliveryTime(msg.toStudent);
    if (allowedAt > new Date()) {
      await prisma.outboundMessage.update({ where: { id: msg.id }, data: { sendAfter: allowedAt } });
      summary.deferred++;
      continue;
    }

    const payload = readPayload(msg);
    try {
      await send(Number(msg.chatId), payload);
      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: "SENT", sentAt: new Date(), attempts: msg.attempts + 1, lastError: null },
      });
      await afterSent(msg);
      summary.sent++;
    } catch (err) {
      const outcome = await recordFailure(msg, err);
      summary[outcome]++;
    }
  }
  return summary;
}

async function recordFailure(msg: OutboundMessage, err: unknown): Promise<"failed" | "dead"> {
  const attempts = msg.attempts + 1;
  const error = err instanceof GrammyError ? `${err.error_code} ${err.description}` : String(err);
  // 403 = user blocked the bot; 400 = bad request (e.g. chat not found): retrying won't help.
  const permanent = err instanceof GrammyError && (err.error_code === 403 || err.error_code === 400);
  const dead = permanent || attempts >= MAX_ATTEMPTS;

  let retryInMs = 2 ** attempts * 60_000; // 2, 4, 8, 16, 32 minutes
  if (err instanceof GrammyError && err.parameters.retry_after) retryInMs = err.parameters.retry_after * 1000;
  if (err instanceof HttpError) retryInMs = Math.min(retryInMs, 60_000); // network blip: retry soon

  await prisma.outboundMessage.update({
    where: { id: msg.id },
    data: {
      status: dead ? "DEAD" : "PENDING",
      attempts,
      lastError: error.slice(0, 500),
      sendAfter: dead ? msg.sendAfter : new Date(Date.now() + retryInMs),
    },
  });
  await logEvent(dead ? "queue.dead" : "queue.send_failed", {
    messageId: msg.id,
    kind: msg.kind,
    dedupeKey: msg.dedupeKey,
    attempts,
    error,
  });
  return dead ? "dead" : "failed";
}

/** Drops not-yet-sent messages about an assignment (used when it's cancelled). */
export async function dropPendingForAssignment(assignmentId: string, kinds: string[]): Promise<number> {
  const result = await prisma.outboundMessage.deleteMany({
    where: { status: "PENDING", kind: { in: kinds }, payload: { path: ["meta", "assignmentId"], equals: assignmentId } },
  });
  return result.count;
}
