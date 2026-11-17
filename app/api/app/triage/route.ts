import { assertAccess } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { teachingSlots } from "@/lib/domain/assignments";
import { triageFor } from "@/lib/domain/triage-view";
import { apiHandler } from "@/lib/http";

// GET /api/app/triage?classId=: Stuck · Silent · Overdue · To review for the teacher's own subjects.
export const GET = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  assertAccess(teachingSlots(user).length > 0, "The triage board is for subject teachers.", { actorUserId: user.id });
  const classId = new URL(request.url).searchParams.get("classId") ?? undefined;
  return Response.json(await triageFor(user, classId));
});
