import { prisma } from "@/lib/db";
import { REMINDER_KINDS, runReminders, type ReminderKind, type ReminderRun } from "@/lib/domain/reminders";
import { sendDue, type SendSummary } from "@/lib/queue/outbound";

// The scheduler entry: Supabase pg_cron calls POST /api/tick every minute. All jobs live in the DB,
// so a restart or a missed minute loses nothing; the next tick picks up whatever is due.

/** Takes the named lease if it is free (or expired). Atomic, so two ticks never overlap. */
export async function acquireLease(name: string, seconds: number): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + seconds * 1000);
  const rows = await prisma.$executeRaw`
    INSERT INTO "JobLease" ("name", "lockedUntil") VALUES (${name}, ${until})
    ON CONFLICT ("name") DO UPDATE SET "lockedUntil" = EXCLUDED."lockedUntil"
    WHERE "JobLease"."lockedUntil" < ${now}`;
  return rows > 0;
}

export async function releaseLease(name: string): Promise<void> {
  await prisma.jobLease.updateMany({ where: { name }, data: { lockedUntil: new Date() } });
}

export type TickSummary = {
  reminders: ReminderRun["counts"];
  digests: number;
  queue: SendSummary;
  /** Names for the [Run reminders now] message. Not logged (student names stay out of logs). */
  details: Pick<ReminderRun, "fired" | "held" | "quietHours">;
};

/** reminders → digests → send whatever is due (including what was just queued). */
export async function runTick(now = new Date()): Promise<TickSummary> {
  const reminders = await runReminders(now);
  const digests = 0;
  const queue = await sendDue(100);
  return {
    reminders: reminders.counts,
    digests,
    queue,
    details: { fired: reminders.fired, held: reminders.held, quietHours: reminders.quietHours },
  };
}

export type TickResult = ({ ok: true; ms: number } & TickSummary) | { skipped: true };

/** runTick under the "tick" lease: shared by POST /api/tick (cron) and [Run reminders now]. */
export async function runTickWithLease(): Promise<TickResult> {
  if (!(await acquireLease("tick", 55))) return { skipped: true };
  const started = Date.now();
  try {
    const summary = await runTick();
    return { ok: true, ms: Date.now() - started, ...summary };
  } finally {
    await releaseLease("tick");
  }
}

/** Counts only, for logs. */
export function tickLogData(r: TickResult) {
  if ("skipped" in r) return r;
  const { details: _details, ...rest } = r;
  return { ...rest, held: _details.held.length, quietHours: _details.quietHours };
}

const KIND_WORDS: Record<ReminderKind, string> = {
  silent: "'did you see it?'",
  due_soon: "'due soon'",
  blocked_checkin: "'still stuck?'",
  overdue: "'was due'",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const unique = (xs: string[]) => [...new Set(xs)];

/**
 * The [Run reminders now] result in plain words. Only names students in the asking teacher's own
 * classes+subjects (`isMine`); everything else is a count.
 * e.g. "Sent: 1 'did you see it?' to Anu · 1 'still stuck?' to Ravi · Ravi is stuck, so no submit reminders."
 */
export function describeTick(s: TickSummary, isMine: (classId: string, subject: string) => boolean): string {
  const parts: string[] = [];
  const { fired, held, quietHours } = s.details;
  if (quietHours) parts.push("Quiet hours: student reminders wait until 7:00 am");

  const mine = fired.filter((f) => isMine(f.classId, f.subject));
  const sent = REMINDER_KINDS.flatMap((kind) => {
    const names = mine.filter((f) => f.kind === kind).map((f) => f.studentName);
    return names.length ? [`${names.length} ${KIND_WORDS[kind]} to ${unique(names).join(", ")}`] : [];
  });
  if (sent.length) parts.push(`Sent: ${sent.join(" · ")}`);
  const others = fired.length - mine.length;
  if (others) parts.push(`${plural(others, "reminder")} for other classes`);
  if (!quietHours && fired.length === 0) parts.push("No reminders due right now");

  const stuck = unique(held.filter((h) => isMine(h.classId, h.subject)).map((h) => h.studentName));
  if (stuck.length) parts.push(`${stuck.join(", ")} ${stuck.length === 1 ? "is" : "are"} stuck, so no submit reminders`);

  if (s.digests) parts.push(`Morning digest sent to ${plural(s.digests, "teacher")}`);
  const q = s.queue;
  if (q.sent) parts.push(`${plural(q.sent, "message")} delivered`);
  if (q.deferred) parts.push(`${q.deferred} waiting for 7:00 am`);
  if (q.failed) parts.push(`${q.failed} to retry`);
  return `${parts.join(" · ")}.`;
}
