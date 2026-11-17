import { getRequestUser } from "@/lib/auth/request-user";
import { doubtThread } from "@/lib/domain/thread";
import { apiHandler } from "@/lib/http";

// GET /api/app/doubts/:saId: the private thread. Owner, subject teacher, class teacher (read-only).
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/doubts/[saId]">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  return Response.json(await doubtThread(user, saId));
});
