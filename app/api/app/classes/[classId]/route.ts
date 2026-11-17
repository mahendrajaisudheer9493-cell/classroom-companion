import { loadClassForRoster } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { getRoster } from "@/lib/domain/roster";
import { apiHandler } from "@/lib/http";

// GET /api/app/classes/:classId: roster + class link. Subject/class teachers of this class only.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/classes/[classId]">) => {
  const user = await getRequestUser(request);
  const { classId } = await ctx.params;
  const klass = await loadClassForRoster(user, classId);
  return Response.json(await getRoster(klass));
});
