import type { MyWorkItem, MyWorkResponse, WorkDetailResponse } from "@/app/app/_lib/types";
import { assertAccess, canViewStudentAssignment, type AccessUser } from "@/lib/access/policy";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { formatIst, nowIst, toIst } from "@/lib/time";

// Student read models: "My work" (grouped by due date) and one assignment in detail.

const DONE = ["SUBMITTED", "COMPLETED"];

export async function myWork(studentId: string): Promise<MyWorkResponse> {
  const sas = await prisma.studentAssignment.findMany({
    where: { studentId, assignment: { status: "PUBLISHED" } }, // cancelled work disappears
    include: { assignment: true },
    orderBy: { assignment: { dueAt: "asc" } },
  });
  const now = nowIst();
  const endOfToday = now.endOf("day");
  const inAWeek = now.plus({ days: 7 }).endOf("day");
  const groups: MyWorkResponse = { overdue: [], today: [], week: [], later: [], done: [] };

  for (const sa of sas) {
    const a = sa.assignment;
    const item: MyWorkItem = {
      saId: sa.id,
      subject: a.subject,
      title: a.title,
      dueLabel: formatIst(a.dueAt),
      status: sa.status,
      updated: sa.ackedVersion !== null && sa.ackedVersion < a.version,
    };
    const due = toIst(a.dueAt);
    if (DONE.includes(sa.status)) groups.done.push(item);
    else if (due < now) groups.overdue.push(item);
    else if (due <= endOfToday) groups.today.push(item);
    else if (due <= inAWeek) groups.week.push(item);
    else groups.later.push(item);
  }
  groups.done.reverse(); // most recent due first
  return groups;
}

export async function workDetail(user: AccessUser & { id: string }, saId: string): Promise<WorkDetailResponse> {
  const sa = await prisma.studentAssignment.findUnique({
    where: { id: saId },
    include: {
      student: true,
      assignment: { include: { class: true } },
      submissions: { orderBy: { createdAt: "desc" } },
      feedback: { include: { teacher: true }, orderBy: { createdAt: "desc" } },
      _count: { select: { doubtMessages: true } },
    },
  });
  if (!sa || sa.assignment.status === "DRAFT") throw new HttpError(404, { error: "not_found", message: "Assignment not found." });
  const a = sa.assignment;
  const level = canViewStudentAssignment(user, { studentId: sa.studentId, assignment: a });
  assertAccess(level !== "none", "You can only see your own work.", { schoolId: a.schoolId, classId: a.classId, actorUserId: user.id });
  const full = level === "full";
  const isOwner = user.student?.id === sa.studentId;
  const open = a.status === "PUBLISHED";

  // What changed since the version the student acknowledged (from the assignment.updated log).
  let changeNote: string | null = null;
  if (sa.ackedVersion !== null && sa.ackedVersion < a.version) {
    const event = await prisma.activityEvent.findFirst({ where: { assignmentId: a.id, type: "assignment.updated" }, orderBy: { createdAt: "desc" } });
    const d = event?.data as { oldDueAt?: string; newDueAt?: string; instructionsChanged?: boolean } | undefined;
    const day = (iso: string) => toIst(new Date(iso)).toFormat("ccc d");
    if (d?.oldDueAt && d.newDueAt && d.oldDueAt !== d.newDueAt) {
      // Same day → show the times; otherwise the days ("from Thu 19 to Mon 23").
      const sameDay = day(d.oldDueAt) === day(d.newDueAt);
      const label = sameDay ? (iso: string) => formatIst(new Date(iso)) : day;
      changeNote = `Updated: due moved from ${label(d.oldDueAt)} to ${label(d.newDueAt)}.`;
    }
    else if (d?.instructionsChanged) changeNote = "Updated: the instructions changed.";
    else changeNote = "This assignment was updated.";
  }

  return {
    level: full ? "full" : "status",
    isOwner,
    saId: sa.id,
    subject: a.subject,
    title: a.title,
    className: a.class.name,
    studentName: sa.student.name,
    dueLabel: formatIst(a.dueAt),
    status: sa.status,
    cancelled: a.status === "CANCELLED",
    ...(full ? { instructions: a.instructions, notes: a.notes } : {}),
    changeNote: isOwner ? changeNote : null,
    canAct: isOwner && open && sa.status !== "COMPLETED",
    canSubmit: isOwner && open && sa.status !== "COMPLETED",
    submissions: full
      ? sa.submissions.map((s) => ({ id: s.id, kind: s.kind, text: s.text, fileName: s.fileName, mimeType: s.mimeType, at: s.createdAt.toISOString() }))
      : [],
    feedback: full
      ? sa.feedback.map((f) => ({ id: f.id, result: f.result, comment: f.comment, teacher: f.teacher.displayName, at: f.createdAt.toISOString() }))
      : [],
    doubtCount: full ? sa._count.doubtMessages : 0,
  };
}
