import { z } from "zod";
import { getRequestUser } from "@/lib/auth/request-user";
import { checkedInClass } from "@/lib/domain/teacher-actions";
import { HttpError, apiHandler } from "@/lib/http";

const body = z.object({ saIds: z.array(z.string()).min(1).max(100) });

// POST /api/app/assignments/:id/checked-in-class { saIds }: → COMPLETED + feedback "Checked in class".
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/assignments/[assignmentId]/checked-in-class">) => {
  const user = await getRequestUser(request);
  const { assignmentId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, { error: "invalid", message: "Pick at least one student." });
  const r = await checkedInClass(user, parsed.data.saIds, assignmentId);
  return Response.json({ ...r, message: `Marked ${r.completed} as completed${r.skipped ? ` (${r.skipped} skipped)` : ""}.` });
});
