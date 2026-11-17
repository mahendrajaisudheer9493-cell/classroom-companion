import { assertAccess } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { myWork } from "@/lib/domain/my-work";
import { apiHandler } from "@/lib/http";

// GET /api/app/my-work: the linked student's own assignments, grouped by due date.
export const GET = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  assertAccess(user.student !== null, "My work is for students.", { actorUserId: user.id });
  return Response.json(await myWork(user.student!.id));
});
