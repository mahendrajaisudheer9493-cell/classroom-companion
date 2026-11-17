import { InlineKeyboard } from "grammy";
import { appUrl } from "@/lib/bot/keyboards";
import { prisma } from "@/lib/db";
import { teachingSlots } from "@/lib/domain/assignments";
import { computeTriage, loadTriageRows, type TriageGroups } from "@/lib/domain/triage";
import { appUserInclude, type AppUser } from "@/lib/auth/user";
import { getEnv } from "@/lib/env";
import { enqueue, sendDue, type OutboundPayload } from "@/lib/queue/outbound";
import { toIst } from "@/lib/time";

// Teacher morning digest (T5): at DIGEST_TIME (07:30 IST), once per teacher per day, the SAME
// triage counts as the board. Code computes every number. Skipped when there's nothing to report.
// Teachers aren't affected by quiet hours.

export type DigestCounts = { stuck: number; silent: number; overdue: number; toReview: number; hasntSeenChange: number };

/** From the triage groups: the four board counts plus "haven't seen a change" (tagged inside Silent). */
export function digestCounts(t: TriageGroups): DigestCounts {
  return {
    ...t.counts,
    hasntSeenChange: t.silent.filter((i) => i.flags.includes("hasnt_seen_change")).length,
  };
}

/** The digest text, or null when every count is zero. */
export function digestText(c: DigestCounts): string | null {
  if (Object.values(c).every((n) => n === 0)) return null;
  return (
    `Good morning! Today across your classes: ${c.stuck} stuck · ${c.silent} silent · ${c.overdue} overdue · ` +
    `${c.toReview} to review · ${c.hasntSeenChange} haven't seen a change.`
  );
}

export function digestPayload(text: string): OutboundPayload {
  return { text, reply_markup: { inline_keyboard: new InlineKeyboard().webApp("Open triage", appUrl("/app/triage")).inline_keyboard } };
}

const WINDOW_HOURS = 3;

/**
 * True from DIGEST_TIME until 3 hours later (IST). A missed tick still sends it; a deploy in the
 * afternoon doesn't send "Good morning!".
 */
export function inDigestWindow(now: Date, digestTime: string): boolean {
  const [h, m] = digestTime.split(":").map(Number);
  const ist = toIst(now);
  const start = ist.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  return ist >= start && ist < start.plus({ hours: WINDOW_HOURS });
}

export async function countsFor(user: AppUser, now: Date): Promise<DigestCounts> {
  const rows = await loadTriageRows(teachingSlots(user));
  return digestCounts(computeTriage(rows, now, { silentAfterMinutes: getEnv().SILENT_AFTER_MINUTES }));
}

/** Queues today's digest for every subject teacher who has something to report. Returns how many. */
export async function runDigests(now = new Date(), opts: { schoolId?: string } = {}): Promise<number> {
  if (!inDigestWindow(now, getEnv().DIGEST_TIME)) return 0;
  const date = toIst(now).toISODate();
  const teachers = await prisma.user.findMany({
    where: {
      chatId: { not: null },
      memberships: { some: { role: "SUBJECT_TEACHER", ...(opts.schoolId ? { schoolId: opts.schoolId } : {}) } },
    },
    include: appUserInclude,
  });

  let queued = 0;
  for (const teacher of teachers) {
    const dedupeKey = `digest:${teacher.id}:${date}`;
    // Already queued today → skip before computing anything.
    if (await prisma.outboundMessage.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
    const text = digestText(await countsFor(teacher, now));
    if (!text) continue; // nothing to report (checked again on the next tick inside the window)
    const r = await enqueue({ chatId: teacher.chatId!, recipientUserId: teacher.id, toStudent: false, kind: "digest", payload: digestPayload(text), dedupeKey });
    if (r.queued) queued++;
  }
  return queued;
}

/** [Send my digest now] (demo): same counts and text, sent right away; repeatable. */
export async function sendDigestNow(user: AppUser, now = new Date()): Promise<{ sent: boolean; counts: DigestCounts }> {
  const counts = await countsFor(user, now);
  const text = digestText(counts);
  if (!text || !user.chatId) return { sent: false, counts };
  await enqueue({
    chatId: user.chatId,
    recipientUserId: user.id,
    toStudent: false,
    kind: "digest",
    payload: digestPayload(text),
    dedupeKey: `digest:${user.id}:now:${now.getTime()}`,
  });
  await sendDue();
  return { sent: true, counts };
}
