import { getRequestUser } from "@/lib/auth/request-user";
import { applyCancel } from "@/lib/domain/assignments";
import { HttpError, apiHandler } from "@/lib/http";

// POST /api/app/assignments/:id/cancel: same domain function as chat (access checked inside).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/assignments/[assignmentId]/cancel">) => {
  const user = await getRequestUser(request);
  const { assignmentId } = await ctx.params;
  const r = await applyCancel(user, assignmentId);
  if (r.status === "not_found") throw new HttpError(404, { error: "not_found", message: "Already cancelled." });
  return Response.json({ message: `Cancelled. ${r.notified} student${r.notified === 1 ? "" : "s"} told.` });
});
