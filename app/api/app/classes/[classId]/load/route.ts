import type { ClassLoadResponse } from "@/app/app/_lib/types";
import { loadClassForClassTeacher } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { classLoad } from "@/lib/domain/class-views";
import { apiHandler } from "@/lib/http";

// GET /api/app/classes/:classId/load: all subjects' published work by due date (CT1). Class teacher only.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/classes/[classId]/load">) => {
  const user = await getRequestUser(request);
  const { classId } = await ctx.params;
  const klass = await loadClassForClassTeacher(user, classId);
  const body: ClassLoadResponse = { class: { id: klass.id, name: klass.name }, days: await classLoad(klass.id) };
  return Response.json(body);
});
