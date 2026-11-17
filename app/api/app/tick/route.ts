import type { TickResponse } from "@/app/app/_lib/types";
import { assertAccess } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { teachingSlots } from "@/lib/domain/assignments";
import { describeTick, runTickWithLease, tickLogData } from "@/lib/domain/tick";
import { apiHandler } from "@/lib/http";
import { logEvent } from "@/lib/log";

export const maxDuration = 60;

// POST /api/app/tick: [Run reminders now]. Same code path (and lease) as the minute cron.
// The answer names only the teacher's own students; other classes are just counted.
export const POST = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  const slots = teachingSlots(user);
  assertAccess(slots.length > 0, "Only teachers can run reminders.", { actorUserId: user.id });
  const result = await runTickWithLease();
  await logEvent("tick.done", { ...tickLogData(result), source: "teacher", userId: user.id }, { schoolId: user.memberships[0]?.schoolId, actorUserId: user.id });
  if ("skipped" in result) return Response.json({ skipped: true } satisfies TickResponse);
  const isMine = (classId: string, subject: string) => slots.some((s) => s.classId === classId && s.subject === subject);
  const body: TickResponse = {
    ok: true,
    ms: result.ms,
    reminders: result.reminders,
    digests: result.digests,
    queue: result.queue,
    message: describeTick(result, isMine),
  };
  return Response.json(body);
});
