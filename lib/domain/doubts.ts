import { InlineKeyboard } from "grammy";
import type { Assignment, Class, Student } from "@prisma/client";
import { assignmentLabel } from "@/lib/bot/cards";
import { appUrl } from "@/lib/bot/keyboards";
import { prisma } from "@/lib/db";
import { enqueue, sendDue, type OutboundPayload } from "@/lib/queue/outbound";

// Real-time doubt alerts to the subject teacher(s) of that class + subject (DESIGN.md §5):
// any hour (toStudent = false → no quiet hours), through the outbound queue, flushed immediately.

export type AlertKind = "stuck" | "stuck_no_details" | "added" | "question" | "still_stuck" | "file_doubt";

type AlertSA = { id: string; assignmentId: string; assignment: Assignment; student: Student & { class: Class } };

const quote = (text: string | null | undefined) => {
  const t = (text ?? "").trim();
  return t ? `"${t.length > 300 ? `${t.slice(0, 300)}…` : t}"` : "";
};

export function alertText(sa: AlertSA, kind: AlertKind, text?: string | null): string {
  const who = `${sa.student.name} (${sa.student.class.name})`;
  const what = assignmentLabel(sa.assignment);
  switch (kind) {
    case "stuck":
      return `🆘 ${who} is stuck on ${what}: ${quote(text)}`;
    case "stuck_no_details":
      return `🆘 ${who} is stuck on ${what} (no details yet).`;
    case "added":
      return `${who} added about ${what}: ${quote(text)}`;
    case "question":
      return `❓ ${who} has a question about ${what}: ${quote(text)}`;
    case "still_stuck":
      return `🆘 ${who} is still stuck on ${what}.`;
    case "file_doubt":
      return `🆘 ${who} sent a doubt about ${what}${text?.trim() ? `: ${quote(text)}` : "."}`;
  }
}

export async function alertTeachers(
  sa: AlertSA,
  opts: {
    kind: AlertKind;
    dedupeKey: string;
    text?: string | null;
    doubtMessageId?: string;
    media?: OutboundPayload["media"];
  },
): Promise<number> {
  const teachers = await prisma.membership.findMany({
    where: {
      role: "SUBJECT_TEACHER",
      classId: sa.assignment.classId,
      subject: { equals: sa.assignment.subject, mode: "insensitive" },
    },
    include: { user: true },
  });
  const kb = new InlineKeyboard()
    .webApp("Reply", appUrl(`/app/doubts/${sa.id}`))
    .webApp("Open", appUrl(`/app/assignments/${sa.assignmentId}`));
  const payload: OutboundPayload = {
    text: alertText(sa, opts.kind, opts.text),
    reply_markup: { inline_keyboard: kb.inline_keyboard },
    media: opts.media,
    meta: { assignmentId: sa.assignmentId, studentAssignmentId: sa.id, doubtMessageId: opts.doubtMessageId },
  };

  let queued = 0;
  for (const t of teachers) {
    if (!t.user.chatId) continue;
    const r = await enqueue({
      chatId: t.user.chatId,
      recipientUserId: t.userId,
      toStudent: false,
      kind: "doubt.alert",
      payload,
      dedupeKey: `${opts.dedupeKey}:${t.userId}`,
    });
    if (r.queued) queued++;
  }
  if (queued) await sendDue();
  return queued;
}
