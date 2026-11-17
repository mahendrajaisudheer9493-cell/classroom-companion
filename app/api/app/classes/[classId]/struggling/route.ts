import type { ClassStrugglingResponse } from "@/app/app/_lib/types";
import { loadClassForClassTeacher } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { classStruggling } from "@/lib/domain/class-views";
import { apiHandler } from "@/lib/http";

// GET /api/app/classes/:classId/struggling: stuck/silent/overdue in 2+ subjects (CT2). Class teacher only.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/classes/[classId]/struggling">) => {
  const user = await getRequestUser(request);
  const { classId } = await ctx.params;
  const klass = await loadClassForClassTeacher(user, classId);
  const body: ClassStrugglingResponse = { class: { id: klass.id, name: klass.name }, students: await classStruggling(klass.id) };
  return Response.json(body);
});
