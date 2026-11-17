import { getRequestUser } from "@/lib/auth/request-user";
import { removeMembership } from "@/lib/domain/school-setup";
import { apiHandler } from "@/lib/http";

// POST /api/app/school/memberships/:id/remove: removes one role of a teacher in the coordinator's school.
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/school/memberships/[membershipId]/remove">) => {
  const user = await getRequestUser(request);
  const { membershipId } = await ctx.params;
  await removeMembership(user, membershipId);
  return Response.json({ message: "Removed." });
});
