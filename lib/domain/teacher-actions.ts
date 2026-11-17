import type { Prisma } from "@prisma/client";
import { assertAccess, canManageClassSubject, type AccessUser } from "@/lib/access/policy";
import { assignmentLabel, nudgeCard, resolvedCard } from "@/lib/bot/cards";
import { prisma } from "@/lib/db";
import { transition, IllegalTransition } from "@/lib/domain/state-machine";
import { logEvent } from "@/lib/log";
import { enqueue, sendDue } from "@/lib/queue/outbound";
import { formatIst, nowIst } from "@/lib/time";

// Teacher actions on students' work from the Mini App. Every one re-checks access (subject teacher
// of that class + subject); class teachers and coordinators are read-only.

export type Teacher = AccessUser & { id: string; displayName: string };

const saInclude = { assignment: true, student: { include: { user: true, class: true } } } satisfies Prisma.StudentAssignmentInclude;
export type TeacherSA = Prisma.StudentAssignmentGetPayload<{ include: typeof saInclude }>;

export async function loadManagedSAs(user: Teacher, saIds: string[]): Promise<TeacherSA[]> {
  const sas = await prisma.studentAssignment.findMany({ where: { id: { in: saIds } }, include: saInclude });
  for (const sa of sas) {
    assertAccess(canManageClassSubject(user, sa.assignment.classId, sa.assignment.subject), "Only the subject teacher can do this.", {
      schoolId: sa.assignment.schoolId,
      classId: sa.assignment.classId,
      actorUserId: user.id,
    });
  }
  return sas;
}

export async function loadManagedSA(user: Teacher, saId: string): Promise<TeacherSA | null> {
  return (await loadManagedSAs(user, [saId]))[0] ?? null;
}

export const logCtx = (sa: TeacherSA, actorUserId: string) => ({
  schoolId: sa.assignment.schoolId,
  classId: sa.assignment.classId,
  assignmentId: sa.assignmentId,
  studentAssignmentId: sa.id,
  actorUserId,
});

export type NudgeResult = { nudged: number; alreadyToday: number; notOnTelegram: number; skipped: number; deliverAt: Date | null };

/**
 * [Nudge]: a gentle reminder to each student, at most once per student + assignment + day
 * (dedupeKey), quiet hours apply. Submitted/completed work isn't nudged.
 */
export async function nudge(user: Teacher, saIds: string[]): Promise<NudgeResult> {
  const sas = await loadManagedSAs(user, saIds);
  const day = nowIst().toISODate();
  const result: NudgeResult = { nudged: 0, alreadyToday: 0, notOnTelegram: 0, skipped: 0, deliverAt: null };
  for (const sa of sas) {
    if (sa.assignment.status !== "PUBLISHED" || sa.status === "SUBMITTED" || sa.status === "COMPLETED") {
      result.skipped++;
      continue;
    }
    const chatId = sa.student.user?.chatId;
    if (!chatId) {
      result.notOnTelegram++;
      continue;
    }
    const r = await enqueue({
      chatId,
      recipientUserId: sa.student.userId,
      toStudent: true,
      kind: "nudge",
      payload: nudgeCard(sa.assignment, sa.id),
      dedupeKey: `nudge:${sa.id}:${day}`,
    });
    if (!r.queued) {
      result.alreadyToday++;
      continue;
    }
    result.nudged++;
    if (r.sendAfter > new Date()) result.deliverAt = r.sendAfter;
    await logEvent("nudge.sent", { sendAfter: r.sendAfter }, logCtx(sa, user.id));
  }
  if (result.nudged) await sendDue();
  return result;
}

/**
 * [Checked in class] for selected students: → COMPLETED (from any open state) + Feedback
 * "Checked in class" + a message to the student. Already completed students are skipped.
 */
export async function checkedInClass(user: Teacher, saIds: string[], assignmentId?: string): Promise<{ completed: number; skipped: number }> {
  const sas = (await loadManagedSAs(user, saIds)).filter((sa) => !assignmentId || sa.assignmentId === assignmentId);
  let completed = 0;
  let skipped = 0;
  for (const sa of sas) {
    if (sa.assignment.status !== "PUBLISHED" || sa.status === "COMPLETED") {
      skipped++;
      continue;
    }
    let next;
    try {
      next = transition(sa, "CHECKED_IN_CLASS", "teacher");
    } catch (err) {
      if (err instanceof IllegalTransition) {
        skipped++;
        continue;
      }
      throw err;
    }
    const latest = await prisma.submission.findFirst({ where: { studentAssignmentId: sa.id }, orderBy: { createdAt: "desc" } });
    const updated = await prisma.studentAssignment.updateMany({ where: { id: sa.id, status: sa.status }, data: { status: next } });
    if (updated.count === 0) {
      skipped++;
      continue;
    }
    const feedback = await prisma.feedback.create({
      data: { studentAssignmentId: sa.id, submissionId: latest?.id ?? null, teacherUserId: user.id, comment: "Checked in class", result: "COMPLETED" },
    });
    completed++;
    const chatId = sa.student.user?.chatId;
    if (chatId) {
      await enqueue({
        chatId,
        recipientUserId: sa.student.userId,
        toStudent: true,
        kind: "feedback",
        payload: { text: `✓ ${assignmentLabel(sa.assignment)} marked completed (checked in class).`, meta: { assignmentId: sa.assignmentId, studentAssignmentId: sa.id } },
        dedupeKey: `fb:${feedback.id}`,
      });
    }
    await logEvent("feedback.sent", { feedbackId: feedback.id, result: "COMPLETED", checkedInClass: true, from: sa.status }, logCtx(sa, user.id));
  }
  if (completed) await sendDue();
  return { completed, skipped };
}

export function nudgeMessage(r: { nudged: number; alreadyToday: number; notOnTelegram: number; deliverAt: Date | null }) {
  const parts: string[] = [];
  if (r.nudged) parts.push(`Nudged ${r.nudged} student${r.nudged === 1 ? "" : "s"}`);
  if (r.deliverAt) parts.push(`will be delivered at ${formatIst(r.deliverAt)}`);
  if (r.alreadyToday) parts.push(`${r.alreadyToday} already nudged today`);
  if (r.notOnTelegram) parts.push(`${r.notOnTelegram} not on Telegram yet`);
  return parts.length ? `${parts.join(" · ")}.` : "Nobody to nudge.";
}

/** [Mark resolved]: BLOCKED → IN_PROGRESS; the student is told and can say [I'm still stuck]. */
export async function markResolved(user: Teacher, saId: string): Promise<{ status: "resolved"; deliverAt: Date | null } | { status: "not_blocked" }> {
  const sa = await loadManagedSA(user, saId);
  if (!sa || sa.status !== "BLOCKED") return { status: "not_blocked" };
  const next = transition(sa, "RESOLVE_DOUBT", "teacher");
  const updated = await prisma.studentAssignment.updateMany({ where: { id: sa.id, status: "BLOCKED" }, data: { status: next } });
  if (updated.count === 0) return { status: "not_blocked" };

  let deliverAt: Date | null = null;
  const chatId = sa.student.user?.chatId;
  if (chatId) {
    const r = await enqueue({
      chatId,
      recipientUserId: sa.student.userId,
      toStudent: true,
      kind: "doubt.resolved",
      payload: resolvedCard(sa.assignment, sa.id),
      dedupeKey: `res:${sa.id}:${sa.blockedAt?.getTime() ?? 0}`,
    });
    if (r.sendAfter > new Date()) deliverAt = r.sendAfter;
    await sendDue();
  }
  await logEvent("doubt.resolved", { deliverAt }, logCtx(sa, user.id));
  return { status: "resolved", deliverAt };
}
