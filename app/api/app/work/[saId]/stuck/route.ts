import { z } from "zod";
import { getRequestUser } from "@/lib/auth/request-user";
import { loadOwn, reportStuck } from "@/lib/domain/student-actions";
import { HttpError, apiHandler } from "@/lib/http";

const body = z.object({ text: z.string().trim().max(2000).optional() });

// POST /api/app/work/:saId/stuck { text? }: [I'm stuck] → BLOCKED + teacher alerted (same as chat).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/work/[saId]/stuck">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  const own = await loadOwn(user, saId);
  if (!own.ok) throw new HttpError(own.reason === "not_yours" ? 403 : 404, { error: own.reason, message: "You can only change your own work." });
  const r = await reportStuck(user, own.sa, parsed.success ? (parsed.data.text ?? null) : null);
  if (!r.ok) throw new HttpError(409, { error: "illegal", message: "This work is already submitted." });
  return Response.json({ message: "Marked as stuck. Your teacher has been notified." });
});
