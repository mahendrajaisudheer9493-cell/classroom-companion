import type { DoubtThreadDto, FeedbackDto, ReviewResponse, SubmissionDto } from "@/app/app/_lib/types";
import { assertAccess, canManageClassSubject, canViewStudentAssignment, type AccessUser } from "@/lib/access/policy";
import { assignmentLabel } from "@/lib/bot/cards";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { readPayload } from "@/lib/queue/outbound";
import { formatIst } from "@/lib/time";

// Read models for the doubt thread and the review screen. Both need "full" access
// (owner, subject teacher, or class teacher read-only); actions need the subject teacher.

async function loadFull(user: AccessUser & { id: string }, saId: string) {
  const sa = await prisma.studentAssignment.findUnique({
    where: { id: saId },
    include: { assignment: true, student: { include: { class: true } } },
  });
  if (!sa) throw new HttpError(404, { error: "not_found", message: "Not found." });
  const level = canViewStudentAssignment(user, { studentId: sa.studentId, assignment: sa.assignment });
  assertAccess(level === "full", "You can only see your own work, or work in your own classes and subjects.", {
    schoolId: sa.assignment.schoolId,
    classId: sa.assignment.classId,
    actorUserId: user.id,
  });
  return { sa, canManage: canManageClassSubject(user, sa.assignment.classId, sa.assignment.subject), isOwner: user.student?.id === sa.studentId };
}

export async function doubtThread(user: AccessUser & { id: string }, saId: string): Promise<DoubtThreadDto> {
  const { sa, canManage, isOwner } = await loadFull(user, saId);
  const messages = await prisma.doubtMessage.findMany({
    where: { studentAssignmentId: sa.id },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });
  // Teacher replies still waiting in the queue (quiet hours) → show when they'll be delivered.
  const queued = await prisma.outboundMessage.findMany({
    where: { kind: "doubt.reply", status: "PENDING", dedupeKey: { in: messages.map((m) => `reply:${m.id}`) } },
  });
  const deliverAt = new Map(queued.map((q) => [readPayload(q).meta?.doubtMessageId, q.sendAfter]));
  return {
    studentName: sa.student.name,
    className: sa.student.class.name,
    assignment: assignmentLabel(sa.assignment),
    assignmentId: sa.assignmentId,
    status: sa.status,
    canReply: canManage && sa.assignment.status === "PUBLISHED",
    canResolve: canManage && sa.status === "BLOCKED",
    isOwner: isOwner && sa.assignment.status === "PUBLISHED",
    messages: messages.map((m) => ({
      id: m.id,
      from: m.authorRole,
      author: m.authorRole === "STUDENT" ? sa.student.name : m.author.displayName,
      text: m.text,
      at: m.createdAt.toISOString(),
      deliverAt: deliverAt.get(m.id)?.toISOString() ?? null,
    })),
  };
}

export async function reviewView(user: AccessUser & { id: string }, saId: string): Promise<ReviewResponse> {
  const { sa, canManage } = await loadFull(user, saId);
  const [submissions, feedback] = await Promise.all([
    prisma.submission.findMany({ where: { studentAssignmentId: sa.id }, orderBy: { createdAt: "desc" } }),
    prisma.feedback.findMany({ where: { studentAssignmentId: sa.id }, include: { teacher: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    saId: sa.id,
    studentName: sa.student.name,
    className: sa.student.class.name,
    assignment: assignmentLabel(sa.assignment),
    assignmentId: sa.assignmentId,
    dueLabel: formatIst(sa.assignment.dueAt),
    status: sa.status,
    canReview: canManage && sa.status === "SUBMITTED" && sa.assignment.status === "PUBLISHED",
    submissions: submissions.map(
      (s): SubmissionDto => ({ id: s.id, kind: s.kind, text: s.text, fileName: s.fileName, mimeType: s.mimeType, at: s.createdAt.toISOString() }),
    ),
    feedback: feedback.map(
      (f): FeedbackDto => ({ id: f.id, result: f.result, comment: f.comment, teacher: f.teacher.displayName, at: f.createdAt.toISOString() }),
    ),
  };
}
