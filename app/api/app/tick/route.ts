import { assertAccess } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { teachingSlots } from "@/lib/domain/assignments";
import { runTickWithLease } from "@/lib/domain/tick";
import { apiHandler } from "@/lib/http";
import { logEvent } from "@/lib/log";

export const maxDuration = 60;

// POST /api/app/tick: [Run reminders now]. Same code path (and lease) as the minute cron.
export const POST = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  assertAccess(teachingSlots(user).length > 0, "Only teachers can run reminders.", { actorUserId: user.id });
  const result = await runTickWithLease();
  await logEvent("tick.done", { ...result, source: "teacher", userId: user.id }, { schoolId: user.memberships[0]?.schoolId, actorUserId: user.id });
  return Response.json(result);
});
