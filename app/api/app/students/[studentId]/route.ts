import { getRequestUser } from "@/lib/auth/request-user";
import { studentWork } from "@/lib/domain/class-views";
import { apiHandler } from "@/lib/http";

// GET /api/app/students/:studentId: one student's work across subjects, read-only.
// Class teacher + the student: all subjects; subject teachers: their own subjects; others: 403.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/students/[studentId]">) => {
  const user = await getRequestUser(request);
  const { studentId } = await ctx.params;
  return Response.json(await studentWork(user, studentId));
});
