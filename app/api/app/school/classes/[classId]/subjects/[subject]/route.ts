import { getRequestUser } from "@/lib/auth/request-user";
import { subjectDetail } from "@/lib/domain/school-health";
import { apiHandler } from "@/lib/http";

// GET /api/app/school/classes/:classId/subjects/:subject: each assignment with student names + statuses.
// Never submission content, doubt text or feedback.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/school/classes/[classId]/subjects/[subject]">) => {
  const user = await getRequestUser(request);
  const { classId, subject } = await ctx.params;
  return Response.json(await subjectDetail(user, classId, decodeURIComponent(subject)));
});
