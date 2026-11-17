import { z } from "zod";
import { assertAccess, canManageClassSubject } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { resolveDue } from "@/lib/domain/assignment-draft";
import { applyChange } from "@/lib/domain/assignments";
import { HttpError, apiHandler } from "@/lib/http";
import { formatIst, nowIst } from "@/lib/time";

const body = z.object({
  mode: z.enum(["preview", "apply"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  expectedVersion: z.number().int(),
});

// POST /api/app/assignments/:id/change: preview old → new, then apply. Same domain function as chat
// (version += 1, statuses stay, students told and asked to acknowledge again).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/assignments/[assignmentId]/change">) => {
  const user = await getRequestUser(request);
  const { assignmentId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, { error: "invalid", message: "Pick a new due date and time." });
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!a || a.status !== "PUBLISHED") throw new HttpError(404, { error: "not_found", message: "This assignment can't be changed." });
  assertAccess(canManageClassSubject(user, a.classId, a.subject), "Only the subject teacher can change this.", {
    schoolId: a.schoolId,
    classId: a.classId,
    actorUserId: user.id,
  });

  const due = resolveDue({ dueDate: parsed.data.dueDate, explicitTime: parsed.data.dueTime, timeOfDay: null }, nowIst());
  if (due.kind !== "ok") throw new HttpError(400, { error: "past_due", message: "That time has already passed. Pick a later due time." });
  if (due.dueAt.toMillis() === a.dueAt.getTime()) throw new HttpError(400, { error: "unchanged", message: "That's the same due time." });

  if (parsed.data.mode === "preview") {
    return Response.json({ preview: `Due: ${formatIst(a.dueAt)} → ${formatIst(due.dueAt)}` });
  }
  const r = await applyChange(user, {
    assignmentId: a.id,
    expectedVersion: parsed.data.expectedVersion,
    dueAt: due.dueAt.toUTC().toISO(),
    instructions: null,
  });
  if (r.status === "conflict") throw new HttpError(409, { error: "conflict", message: "This assignment changed in the meantime. Reload and try again." });
  if (r.status === "not_found") throw new HttpError(404, { error: "not_found", message: "This assignment can't be changed." });
  const told = r.notified + r.resent;
  return Response.json({ message: `Updated. ${told} student${told === 1 ? "" : "s"} notified; they'll be asked to acknowledge again.` });
});
