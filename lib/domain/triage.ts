import type { StudentAssignmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { TeachingSlot } from "@/lib/domain/assignment-draft";

// The teacher's triage board: "talk to these 4 today". Pure grouping (computeTriage) with a clock
// parameter so it's unit-testable; loadTriageRows reads the facts it needs from the database.

export type TriageRow = {
  saId: string;
  studentId: string;
  studentName: string;
  linked: boolean;
  classId: string;
  className: string;
  assignmentId: string;
  subject: string;
  title: string;
  dueAt: Date;
  version: number;
  status: StudentAssignmentStatus;
  ackedVersion: number | null;
  deliveredAt: Date | null;
  lastStudentActivityAt: Date | null;
  blockedAt: Date | null;
  lastStudentDoubtAt: Date | null;
  lastTeacherReplyAt: Date | null;
  latestSubmissionAt: Date | null;
  latestFeedbackAt: Date | null;
};

export type TriageFlag = "hasnt_seen_change" | "not_on_telegram" | "unanswered_question" | "overdue";

export type TriageItem = TriageRow & { flags: TriageFlag[]; lastActivityAt: Date | null; since: Date | null };

export type TriageGroups = {
  stuck: TriageItem[];
  silent: TriageItem[];
  overdue: TriageItem[];
  toReview: TriageItem[];
  counts: { stuck: number; silent: number; overdue: number; toReview: number };
};

const DONE: StudentAssignmentStatus[] = ["SUBMITTED", "COMPLETED"];
const time = (d: Date | null) => d?.getTime() ?? 0;

export function flagsFor(row: TriageRow, now: Date): TriageFlag[] {
  const flags: TriageFlag[] = [];
  if (row.ackedVersion !== null && row.ackedVersion < row.version && !DONE.includes(row.status)) flags.push("hasnt_seen_change");
  if (!row.linked) flags.push("not_on_telegram");
  if (hasUnansweredQuestion(row)) flags.push("unanswered_question");
  if (isOverdue(row, now)) flags.push("overdue");
  return flags;
}

export const hasUnansweredQuestion = (r: TriageRow) =>
  r.lastStudentDoubtAt !== null && (r.lastTeacherReplyAt === null || r.lastStudentDoubtAt > r.lastTeacherReplyAt);

export const isOverdue = (r: TriageRow, now: Date) => r.dueAt < now && !DONE.includes(r.status);

/** 🆘 BLOCKED, or a student question newer than the latest teacher reply. */
export const isStuck = (r: TriageRow) => r.status === "BLOCKED" || hasUnansweredQuestion(r);

/**
 * 👀 Delivered, still ASSIGNED and no student activity for `silentAfterMinutes` since delivery.
 * Also listed here (with a tag): students who haven't seen a change, and students not on Telegram yet.
 */
export function isSilent(r: TriageRow, now: Date, silentAfterMinutes: number): boolean {
  if (DONE.includes(r.status)) return false;
  if (!r.linked) return true; // tag: not on Telegram yet
  if (r.ackedVersion !== null && r.ackedVersion < r.version) return true; // tag: hasn't seen the change
  if (!r.deliveredAt || r.status !== "ASSIGNED") return false;
  const quietSince = Math.max(time(r.deliveredAt), time(r.lastStudentActivityAt));
  return now.getTime() - quietSince >= silentAfterMinutes * 60_000;
}

/** 📥 SUBMITTED and the latest submission has no feedback after it. */
export const needsReview = (r: TriageRow) =>
  r.status === "SUBMITTED" && (r.latestFeedbackAt === null || time(r.latestSubmissionAt) > time(r.latestFeedbackAt));

export function computeTriage(rows: TriageRow[], now: Date, opts: { silentAfterMinutes: number }): TriageGroups {
  const items: TriageItem[] = rows.map((r) => ({
    ...r,
    flags: flagsFor(r, now),
    lastActivityAt: r.lastStudentActivityAt,
    since: r.status === "BLOCKED" ? (r.blockedAt ?? r.lastStudentDoubtAt) : r.lastStudentDoubtAt,
  }));
  const byDue = (a: TriageItem, b: TriageItem) => a.dueAt.getTime() - b.dueAt.getTime() || a.studentName.localeCompare(b.studentName);

  const stuck = items.filter(isStuck).sort((a, b) => time(a.since) - time(b.since)); // oldest first
  const silent = items.filter((r) => isSilent(r, now, opts.silentAfterMinutes)).sort(byDue);
  const overdue = items.filter((r) => isOverdue(r, now)).sort(byDue);
  const toReview = items.filter(needsReview).sort((a, b) => time(a.latestSubmissionAt) - time(b.latestSubmissionAt));
  return {
    stuck,
    silent,
    overdue,
    toReview,
    counts: { stuck: stuck.length, silent: silent.length, overdue: overdue.length, toReview: toReview.length },
  };
}

/** Facts for every StudentAssignment of PUBLISHED assignments in the teacher's class+subject pairs. */
export async function loadTriageRows(slots: TeachingSlot[], classId?: string): Promise<TriageRow[]> {
  const pairs = slots.filter((s) => !classId || s.classId === classId);
  if (pairs.length === 0) return [];
  const sas = await prisma.studentAssignment.findMany({
    where: {
      assignment: { status: "PUBLISHED", OR: pairs.map((s) => ({ classId: s.classId, subject: s.subject })) },
    },
    include: {
      assignment: { include: { class: true } },
      student: true,
      doubtMessages: { select: { authorRole: true, createdAt: true } },
      submissions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      feedback: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const latest = (dates: Date[]) => (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null);
  return sas.map((sa) => ({
    saId: sa.id,
    studentId: sa.studentId,
    studentName: sa.student.name,
    linked: sa.student.userId !== null,
    classId: sa.assignment.classId,
    className: sa.assignment.class.name,
    assignmentId: sa.assignmentId,
    subject: sa.assignment.subject,
    title: sa.assignment.title,
    dueAt: sa.assignment.dueAt,
    version: sa.assignment.version,
    status: sa.status,
    ackedVersion: sa.ackedVersion,
    deliveredAt: sa.deliveredAt,
    lastStudentActivityAt: sa.lastStudentActivityAt,
    blockedAt: sa.blockedAt,
    lastStudentDoubtAt: latest(sa.doubtMessages.filter((d) => d.authorRole === "STUDENT").map((d) => d.createdAt)),
    lastTeacherReplyAt: latest(sa.doubtMessages.filter((d) => d.authorRole === "TEACHER").map((d) => d.createdAt)),
    latestSubmissionAt: sa.submissions[0]?.createdAt ?? null,
    latestFeedbackAt: sa.feedback[0]?.createdAt ?? null,
  }));
}
