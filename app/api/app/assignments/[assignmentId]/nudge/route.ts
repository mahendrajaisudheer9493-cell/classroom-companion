import { z } from "zod";
import type { NudgeResponse } from "@/app/app/_lib/types";
import { getRequestUser } from "@/lib/auth/request-user";
import { nudge, nudgeMessage } from "@/lib/domain/teacher-actions";
import { HttpError, apiHandler } from "@/lib/http";

const body = z.object({ saIds: z.array(z.string()).min(1).max(100) });

// POST /api/app/assignments/:id/nudge { saIds }: subject teacher only (checked per student).
export const POST = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, { error: "invalid", message: "Pick at least one student." });
  const r = await nudge(user, parsed.data.saIds);
  const res: NudgeResponse = { ...r, deliverAt: r.deliverAt?.toISOString() ?? null, message: nudgeMessage(r) };
  return Response.json(res);
});
