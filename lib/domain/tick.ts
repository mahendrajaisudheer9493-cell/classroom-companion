import { prisma } from "@/lib/db";
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
  queue: SendSummary;
  reminders: string;
  digest: string;
};

export async function runTick(): Promise<TickSummary> {
  const queue = await sendDue(100);
  return {
    queue,
    reminders: "not implemented yet (Task 6)",
    digest: "not implemented yet (Task 6)",
  };
}

/** runTick under the "tick" lease: shared by POST /api/tick (cron) and [Run reminders now]. */
export async function runTickWithLease(): Promise<({ ok: true; ms: number } & TickSummary) | { skipped: true }> {
  if (!(await acquireLease("tick", 55))) return { skipped: true };
  const started = Date.now();
  try {
    const summary = await runTick();
    return { ok: true, ms: Date.now() - started, ...summary };
  } finally {
    await releaseLease("tick");
  }
}
