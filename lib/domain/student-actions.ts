import type { Prisma, SubmissionKind } from "@prisma/client";
import { assignmentLabel } from "@/lib/bot/cards";
import { prisma } from "@/lib/db";
import { alertTeachers, type AlertKind } from "@/lib/domain/doubts";
import { IllegalTransition, transition, type StudentEvent } from "@/lib/domain/state-machine";
import { logEvent } from "@/lib/log";

// Everything a student does to their own work. Each function re-checks ownership, changes status
// only through the state machine, and records lastStudentActivityAt.

const saInclude = { assignment: true, student: { include: { class: true } } } satisfies Prisma.StudentAssignmentInclude;
export type OwnSA = Prisma.StudentAssignmentGetPayload<{ include: typeof saInclude }>;

export type StudentUser = { id: string; student: { id: string } | null };

/** The student's open homework: published, not completed, soonest due first. */
export function openAssignments(studentId: string) {
  return prisma.studentAssignment.findMany({
    where: { studentId, status: { not: "COMPLETED" }, assignment: { status: "PUBLISHED" } },
    include: saInclude,
    orderBy: { assignment: { dueAt: "asc" } },
  });
}

export type LoadResult = { ok: true; sa: OwnSA; label: string } | { ok: false; reason: "not_found" | "not_yours" | "cancelled" };

/** Loads a StudentAssignment the user owns; logs access.denied for someone else's. */
export async function loadOwn(user: StudentUser, saId: string): Promise<LoadResult> {
  const sa = await prisma.studentAssignment.findUnique({ where: { id: saId }, include: saInclude });
  if (!sa) return { ok: false, reason: "not_found" };
  if (user.student?.id !== sa.studentId) {
    await logEvent(
      "access.denied",
      { reason: "student_action_not_owner", studentAssignmentId: saId },
      { schoolId: sa.assignment.schoolId, classId: sa.assignment.classId, actorUserId: user.id },
    );
    return { ok: false, reason: "not_yours" };
  }
  if (sa.assignment.status !== "PUBLISHED") return { ok: false, reason: "cancelled" };
  return { ok: true, sa, label: assignmentLabel(sa.assignment) };
}

export async function touch(saId: string) {
  await prisma.studentAssignment.update({ where: { id: saId }, data: { lastStudentActivityAt: new Date() } });
}

const logCtx = (sa: OwnSA, actorUserId: string) => ({
  schoolId: sa.assignment.schoolId,
  classId: sa.assignment.classId,
  assignmentId: sa.assignmentId,
  studentAssignmentId: sa.id,
  actorUserId,
});

export type EventResult = { ok: true; changed: boolean; sa: OwnSA } | { ok: false; reason: "illegal"; status: string };

/** Applies a student event through the state machine (no-op repeats allowed) and records activity. */
async function applyEvent(user: StudentUser & { id: string }, sa: OwnSA, event: StudentEvent): Promise<EventResult> {
  let next;
  try {
    next = transition(sa, event, "student");
  } catch (err) {
    if (err instanceof IllegalTransition) {
      await touch(sa.id);
      return { ok: false, reason: "illegal", status: sa.status };
    }
    throw err;
  }
  const enteringBlocked = next === "BLOCKED" && sa.status !== "BLOCKED";
  const updated = await prisma.studentAssignment.update({
    where: { id: sa.id },
    data: { status: next, lastStudentActivityAt: new Date(), ...(enteringBlocked ? { blockedAt: new Date() } : {}) },
    include: saInclude,
  });
  if (next !== sa.status) {
    await logEvent("student.status_changed", { from: sa.status, to: next, event }, logCtx(sa, user.id));
  }
  return { ok: true, changed: next !== sa.status, sa: updated };
}

// ───────────────────────────── Progress ─────────────────────────────

export async function reportProgress(user: StudentUser & { id: string }, sa: OwnSA) {
  return applyEvent(user, sa, "REPORT_PROGRESS");
}

// ───────────────────────────── Stuck and doubts ─────────────────────────────

async function saveDoubt(user: { id: string }, sa: OwnSA, text: string) {
  return prisma.doubtMessage.create({
    data: { studentAssignmentId: sa.id, authorUserId: user.id, authorRole: "STUDENT", text: text.slice(0, 2000) },
  });
}

/**
 * Student is stuck: → BLOCKED (submit reminders stop), save their words as a DoubtMessage if any,
 * and alert the subject teacher(s) in real time. Repeating while already blocked doesn't re-alert.
 */
export async function reportStuck(user: StudentUser & { id: string }, sa: OwnSA, doubtText: string | null) {
  const result = await applyEvent(user, sa, "REPORT_STUCK");
  if (!result.ok) return result;
  const blocked = result.sa;
  const doubt = doubtText?.trim() ? await saveDoubt(user, blocked, doubtText.trim()) : null;
  if (doubt) {
    await alertTeachers(blocked, { kind: "stuck", text: doubt.text, doubtMessageId: doubt.id, dedupeKey: `doubt:${doubt.id}` });
  } else if (result.changed) {
    await alertTeachers(blocked, { kind: "stuck_no_details", dedupeKey: `stuck:${blocked.id}:${blocked.blockedAt?.getTime()}` });
  }
  if (result.changed || doubt) {
    await logEvent("doubt.raised", { withDetails: Boolean(doubt), doubtMessageId: doubt?.id }, logCtx(blocked, user.id));
  }
  return result;
}

/** A doubt without a status change: details typed after [I'm stuck], or [Ask my teacher] on a question. */
export async function addDoubt(user: StudentUser & { id: string }, sa: OwnSA, text: string, kind: Extract<AlertKind, "added" | "question">) {
  const doubt = await saveDoubt(user, sa, text);
  await touch(sa.id);
  await alertTeachers(sa, { kind, text: doubt.text, doubtMessageId: doubt.id, dedupeKey: `doubt:${doubt.id}` });
  await logEvent(kind === "question" ? "doubt.question" : "doubt.details", { doubtMessageId: doubt.id }, logCtx(sa, user.id));
  return doubt;
}

/** A doubt sent as a photo/file ("It's a doubt"): saved as "[photo] caption" and forwarded to the teacher. */
export async function addFileDoubt(
  user: StudentUser & { id: string },
  sa: OwnSA,
  file: { kind: "PHOTO" | "FILE"; fileId: string; caption: string | null },
) {
  const text = `[${file.kind === "PHOTO" ? "photo" : "file"}]${file.caption ? ` ${file.caption}` : ""}`;
  const doubt = await saveDoubt(user, sa, text);
  await touch(sa.id);
  await alertTeachers(sa, {
    kind: "file_doubt",
    text: file.caption,
    doubtMessageId: doubt.id,
    dedupeKey: `doubt:${doubt.id}`,
    media: { type: file.kind === "PHOTO" ? "photo" : "document", fileId: file.fileId },
  });
  await logEvent("doubt.raised", { withFile: true, doubtMessageId: doubt.id }, logCtx(sa, user.id));
  return doubt;
}

/** [Still stuck] on the morning check-in: stays BLOCKED, teacher told once per blocked episode. */
export async function stillStuck(user: StudentUser & { id: string }, sa: OwnSA) {
  const result = await applyEvent(user, sa, "REPORT_STUCK");
  if (!result.ok) return result;
  const alerted = await alertTeachers(result.sa, {
    kind: "still_stuck",
    dedupeKey: `still:${result.sa.id}:${result.sa.blockedAt?.getTime()}`,
  });
  return { ...result, alerted: alerted > 0 };
}

/** [I'm still stuck] after the teacher marked the doubt resolved: back to BLOCKED, teacher alerted. */
export async function stuckAgain(user: StudentUser & { id: string }, sa: OwnSA) {
  const result = await applyEvent(user, sa, "REPORT_STUCK");
  if (!result.ok) return result;
  if (result.changed) {
    await alertTeachers(result.sa, {
      kind: "still_stuck",
      dedupeKey: `still:${result.sa.id}:${result.sa.blockedAt?.getTime()}`,
    });
    await logEvent("doubt.raised", { again: true }, logCtx(result.sa, user.id));
  }
  return result;
}

// ───────────────────────────── Submissions ─────────────────────────────

export type SubmissionInput = {
  kind: SubmissionKind;
  text?: string | null;
  file?: { fileId: string; fileUniqueId: string; fileName?: string | null; mimeType?: string | null };
};

export type SubmitResult =
  | { status: "submitted"; label: string; sa: OwnSA }
  | { status: "duplicate"; label: string }
  | { status: "closed"; label: string; reason: "cancelled" | "completed" };

/**
 * Hand in work: Submission row + SUBMITTED (also from NEEDS_REVISION; resubmission allowed, latest
 * counts, history kept). The same file (telegramFileUniqueId) or a repeated "in class" is accepted once.
 * Never for cancelled or completed assignments.
 */
export async function submitWork(user: StudentUser & { id: string }, saId: string, input: SubmissionInput): Promise<SubmitResult | LoadResult> {
  const loaded = await loadOwn(user, saId);
  if (!loaded.ok) {
    if (loaded.reason === "cancelled") {
      const sa = await prisma.studentAssignment.findUniqueOrThrow({ where: { id: saId }, include: { assignment: true } });
      return { status: "closed", label: assignmentLabel(sa.assignment), reason: "cancelled" };
    }
    return loaded;
  }
  const { sa, label } = loaded;
  if (sa.status === "COMPLETED") return { status: "closed", label, reason: "completed" };

  const latest = await prisma.submission.findFirst({ where: { studentAssignmentId: sa.id }, orderBy: { createdAt: "desc" } });
  const sameFile = input.file
    ? await prisma.submission.findFirst({ where: { studentAssignmentId: sa.id, telegramFileUniqueId: input.file.fileUniqueId } })
    : null;
  const repeatedInClass = input.kind === "IN_CLASS" && sa.status === "SUBMITTED" && latest?.kind === "IN_CLASS";
  const repeatedText = input.kind === "TEXT" && sa.status === "SUBMITTED" && latest?.kind === "TEXT" && latest.text === input.text;
  if (sameFile || repeatedInClass || repeatedText) {
    await touch(sa.id);
    return { status: "duplicate", label };
  }

  const next = transition(sa, "SUBMIT", "student");
  const [submission] = await prisma.$transaction([
    prisma.submission.create({
      data: {
        studentAssignmentId: sa.id,
        kind: input.kind,
        text: input.text ?? null,
        telegramFileId: input.file?.fileId ?? null,
        telegramFileUniqueId: input.file?.fileUniqueId ?? null,
        fileName: input.file?.fileName ?? null,
        mimeType: input.file?.mimeType ?? null,
      },
    }),
    prisma.studentAssignment.update({ where: { id: sa.id }, data: { status: next, lastStudentActivityAt: new Date() } }),
  ]);
  await logEvent(
    "submission.received",
    { submissionId: submission.id, kind: input.kind, resubmission: Boolean(latest), from: sa.status },
    logCtx(sa, user.id),
  );
  return { status: "submitted", label, sa: { ...sa, status: next } };
}
