import { getRequestUser } from "@/lib/auth/request-user";
import { classHealth } from "@/lib/domain/school-health";
import { apiHandler } from "@/lib/http";

// GET /api/app/school/classes/:classId: the same numbers per subject. Coordinator of the class's school only.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/school/classes/[classId]">) => {
  const user = await getRequestUser(request);
  const { classId } = await ctx.params;
  return Response.json(await classHealth(user, classId));
});
