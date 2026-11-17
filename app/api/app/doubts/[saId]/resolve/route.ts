import { getRequestUser } from "@/lib/auth/request-user";
import { markResolved } from "@/lib/domain/teacher-actions";
import { HttpError, apiHandler } from "@/lib/http";
import { formatIst } from "@/lib/time";

// POST /api/app/doubts/:saId/resolve: [Mark resolved] (subject teacher only; checked inside).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/doubts/[saId]/resolve">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const r = await markResolved(user, saId);
  if (r.status === "not_blocked") throw new HttpError(409, { error: "not_blocked", message: "This student isn't marked as stuck any more." });
  return Response.json({
    message: r.deliverAt ? `Marked resolved. The student will be told at ${formatIst(r.deliverAt)}.` : "Marked resolved. The student has been told.",
  });
});
