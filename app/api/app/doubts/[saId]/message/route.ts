import { z } from "zod";
import { assertAccess, canManageClassSubject } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { addDoubt, loadOwn } from "@/lib/domain/student-actions";
import { replyToDoubt } from "@/lib/domain/teacher-actions";
import { HttpError, apiHandler } from "@/lib/http";
import { formatIst } from "@/lib/time";

const body = z.object({ text: z.string().trim().min(1, "Type a message").max(2000) });

// POST /api/app/doubts/:saId/message { text }
// Subject teacher → reply (queued to the student, quiet hours apply). The student who owns it →
// a doubt message (teacher alerted, like a chat doubt). Anyone else → 403.
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/doubts/[saId]/message">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, { error: "invalid", message: parsed.error.issues[0]?.message ?? "Type a message." });
  const sa = await prisma.studentAssignment.findUnique({ where: { id: saId }, include: { assignment: true } });
  if (!sa || sa.assignment.status !== "PUBLISHED") throw new HttpError(404, { error: "not_found", message: "This assignment is closed." });

  if (user.student?.id === sa.studentId) {
    const own = await loadOwn(user, saId);
    if (!own.ok) throw new HttpError(404, { error: "not_found", message: "This assignment is closed." });
    await addDoubt(user, own.sa, parsed.data.text, sa.status === "BLOCKED" ? "added" : "question");
    return Response.json({ message: "Sent to your teacher ✓" });
  }

  assertAccess(canManageClassSubject(user, sa.assignment.classId, sa.assignment.subject), "Only the subject teacher can reply.", {
    schoolId: sa.assignment.schoolId,
    classId: sa.assignment.classId,
    actorUserId: user.id,
  });
  const r = await replyToDoubt(user, saId, parsed.data.text);
  return Response.json({ message: r.deliverAt ? `Will be delivered at ${formatIst(r.deliverAt)} (quiet hours).` : "Sent ✓", deliverAt: r.deliverAt });
});
