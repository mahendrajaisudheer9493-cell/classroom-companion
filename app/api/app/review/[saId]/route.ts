import { z } from "zod";
import { getRequestUser } from "@/lib/auth/request-user";
import { giveFeedback } from "@/lib/domain/teacher-actions";
import { reviewView } from "@/lib/domain/thread";
import { HttpError, apiHandler } from "@/lib/http";
import { formatIst } from "@/lib/time";

// GET /api/app/review/:saId: submissions (latest first) + feedback history. "full" access only.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/review/[saId]">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  return Response.json(await reviewView(user, saId));
});

const body = z.object({ result: z.enum(["COMPLETED", "NEEDS_REVISION"]), comment: z.string().trim().max(1000).default("") });

// POST /api/app/review/:saId { result, comment }: subject teacher only (class teachers are read-only).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/review/[saId]">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, { error: "invalid", message: "Pick Completed or Needs revision." });
  if (parsed.data.result === "NEEDS_REVISION" && !parsed.data.comment) {
    throw new HttpError(400, { error: "invalid", message: "Say what needs to change." });
  }
  const r = await giveFeedback(user, saId, parsed.data);
  if (r.status === "not_submitted") throw new HttpError(409, { error: "not_submitted", message: "There's nothing waiting for review." });
  return Response.json({ message: r.deliverAt ? `Feedback saved. The student gets it at ${formatIst(r.deliverAt)}.` : "Feedback sent ✓" });
});
