import { getRequestUser } from "@/lib/auth/request-user";
import { acknowledge } from "@/lib/domain/acknowledge";
import { HttpError, apiHandler } from "@/lib/http";

// POST /api/app/work/:saId/ack: [Got it] (same domain function as the chat button).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/work/[saId]/ack">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const r = await acknowledge(user, saId);
  if (r.status === "not_yours") throw new HttpError(403, { error: "forbidden", message: "This isn't your assignment." });
  if (r.status !== "ok") throw new HttpError(404, { error: "not_found", message: "This assignment is closed." });
  return Response.json({ message: `Got it ✓ ${r.label}` });
});
