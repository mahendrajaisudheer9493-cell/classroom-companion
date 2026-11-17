import { getRequestUser } from "@/lib/auth/request-user";
import { workDetail } from "@/lib/domain/my-work";
import { apiHandler } from "@/lib/http";

// GET /api/app/work/:saId: owner / subject teacher / class teacher → full; coordinator → status only.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/work/[saId]">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  return Response.json(await workDetail(user, saId));
});
