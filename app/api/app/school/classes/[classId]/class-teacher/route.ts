import { z } from "zod";
import { getRequestUser } from "@/lib/auth/request-user";
import { setClassTeacher } from "@/lib/domain/school-setup";
import { apiHandler, parseBody } from "@/lib/http";

// POST /api/app/school/classes/:classId/class-teacher { userId }: sets (replaces) the class teacher.
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/school/classes/[classId]/class-teacher">) => {
  const user = await getRequestUser(request);
  const { classId } = await ctx.params;
  const { userId } = await parseBody(request, z.object({ userId: z.string().min(1) }));
  await setClassTeacher(user, classId, userId);
  return Response.json({ message: "Class teacher updated." });
});
