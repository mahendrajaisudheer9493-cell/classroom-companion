import { getRequestUser } from "@/lib/auth/request-user";
import { addStudents, addStudentsSchema } from "@/lib/domain/school-setup";
import { apiHandler, parseBody } from "@/lib/http";

// POST /api/app/classes/:classId/students { roster }: add pasted names with the next roll numbers.
// Coordinator of the school, or a subject/class teacher of the class; everyone else 403 (logged).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/classes/[classId]/students">) => {
  const user = await getRequestUser(request);
  const { classId } = await ctx.params;
  const { roster } = await parseBody(request, addStudentsSchema);
  return Response.json(await addStudents(user, classId, roster));
});
