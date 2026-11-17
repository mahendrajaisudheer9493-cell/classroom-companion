import type {
  FeedbackDto,
  LoadDayDto,
  StrugglingStudentDto,
  StudentWorkResponse,
  SubmissionDto,
} from "@/app/app/_lib/types";
import { assertAccess, scopeAllowsSubject, studentWorkScope, type AccessUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import type { TeachingSlot } from "@/lib/domain/assignment-draft";
import { isOverdue, isSilent, isStuck, loadTriageRows, type TriageRow } from "@/lib/domain/triage";
import { getEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { formatIst, toIst } from "@/lib/time";

// Class teacher views (CT1, CT2) and one student's work across subjects. Read-only everywhere.
// Grouping is pure (unit-tested); the loaders reuse the triage rows so numbers match the board.

export const HEAVY_DAY = 3;

// ───────────────────────────── CT1: class load by due date ─────────────────────────────

type LoadAssignment = { id: string; subject: string; title: string; dueAt: Date };

/** Published work grouped by IST due date; 3+ on one day → heavy. */
export function groupLoad(assignments: LoadAssignment[]): LoadDayDto[] {
  const days = new Map<string, LoadDayDto>();
  for (const a of [...assignments].sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime())) {
    const due = toIst(a.dueAt);
    const date = due.toISODate()!;
    const day = days.get(date) ?? { date, label: due.toFormat("ccc d LLL"), heavy: false, items: [] };
    day.items.push({ id: a.id, subject: a.subject, title: a.title, dueLabel: formatIst(a.dueAt) });
    day.heavy = day.items.length >= HEAVY_DAY;
    days.set(date, day);
  }
  return [...days.values()];
}

/** Every PUBLISHED assignment of the class, all subjects, from today (IST) on. */
export async function classLoad(classId: string, now = new Date()): Promise<LoadDayDto[]> {
  const assignments = await prisma.assignment.findMany({
    where: { classId, status: "PUBLISHED", dueAt: { gte: toIst(now).startOf("day").toJSDate() } },
    select: { id: true, subject: true, title: true, dueAt: true },
  });
  return groupLoad(assignments);
}

// ───────────────────────────── CT2: struggling in 2+ subjects ─────────────────────────────

export type Problem = "stuck" | "silent" | "overdue";
const PROBLEMS: Problem[] = ["stuck", "silent", "overdue"];

/** Which triage problems this row has. "Silent" here means a linked student going quiet, not "not on Telegram". */
export function problemsOf(r: TriageRow, now: Date, silentAfterMinutes: number): Problem[] {
  const out: Problem[] = [];
  if (isStuck(r)) out.push("stuck");
  if (r.linked && isSilent(r, now, silentAfterMinutes)) out.push("silent");
  if (isOverdue(r, now)) out.push("overdue");
  return out;
}

/** "stuck in Maths, overdue in English and Science" */
export function problemSummary(subjects: { subject: string; problems: Problem[] }[]): string {
  return PROBLEMS.flatMap((p) => {
    const names = subjects.filter((s) => s.problems.includes(p)).map((s) => s.subject);
    if (names.length === 0) return [];
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return [`${p} in ${list}`];
  }).join(", ");
}

/** Students with a problem in 2 or more subjects, most subjects first. */
export function strugglingFrom(rows: TriageRow[], now: Date, silentAfterMinutes: number): StrugglingStudentDto[] {
  const byStudent = new Map<string, { name: string; subjects: Map<string, Set<Problem>> }>();
  for (const r of rows) {
    const problems = problemsOf(r, now, silentAfterMinutes);
    if (problems.length === 0) continue;
    const s = byStudent.get(r.studentId) ?? { name: r.studentName, subjects: new Map() };
    const set = s.subjects.get(r.subject) ?? new Set<Problem>();
    problems.forEach((p) => set.add(p));
    s.subjects.set(r.subject, set);
    byStudent.set(r.studentId, s);
  }
  return [...byStudent.entries()]
    .filter(([, s]) => s.subjects.size >= 2)
    .map(([studentId, s]) => {
      const subjects = [...s.subjects.entries()]
        .map(([subject, set]) => ({ subject, problems: PROBLEMS.filter((p) => set.has(p)) }))
        .sort((a, b) => a.subject.localeCompare(b.subject));
      return { studentId, name: s.name, subjects, summary: problemSummary(subjects) };
    })
    .sort((a, b) => b.subjects.length - a.subjects.length || a.name.localeCompare(b.name));
}

/** All (class, subject) pairs with published work in the class: the class teacher sees every subject. */
async function classSlots(classId: string): Promise<TeachingSlot[]> {
  const klass = await prisma.class.findUniqueOrThrow({ where: { id: classId } });
  const subjects = await prisma.assignment.findMany({
    where: { classId, status: "PUBLISHED" },
    distinct: ["subject"],
    select: { subject: true },
  });
  return subjects.map((s) => ({ classId, className: klass.name, subject: s.subject }));
}

export async function classStruggling(classId: string, now = new Date()): Promise<StrugglingStudentDto[]> {
  const rows = await loadTriageRows(await classSlots(classId));
  return strugglingFrom(rows, now, getEnv().SILENT_AFTER_MINUTES);
}

// ───────────────────────────── One student's work (read-only) ─────────────────────────────

/**
 * /app/students/:id. Class teacher and the student: every subject. Subject teachers: only their
 * own subjects. Anyone else: 403 (logged).
 */
export async function studentWork(user: AccessUser & { id: string }, studentId: string, now = new Date()): Promise<StudentWorkResponse> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { class: true } });
  if (!student) throw new HttpError(404, { error: "not_found", message: "Student not found." });
  const scope = studentWorkScope(user, student);
  assertAccess(scope !== null, "You can only see students in your own classes.", {
    schoolId: student.schoolId,
    classId: student.classId,
    actorUserId: user.id,
  });

  const sas = await prisma.studentAssignment.findMany({
    where: { studentId, assignment: { status: "PUBLISHED" } },
    include: {
      assignment: true,
      submissions: { orderBy: { createdAt: "desc" } },
      feedback: { include: { teacher: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { assignment: { dueAt: "asc" } },
  });
  const visible = sas.filter((sa) => scopeAllowsSubject(scope, sa.assignment.subject));
  return {
    student: { id: student.id, name: student.name, rollNo: student.rollNo, className: student.class.name, linked: student.userId !== null },
    allSubjects: scope.all,
    items: visible.map((sa) => ({
      saId: sa.id,
      subject: sa.assignment.subject,
      title: sa.assignment.title,
      dueLabel: formatIst(sa.assignment.dueAt),
      status: sa.status,
      overdue: sa.assignment.dueAt < now && sa.status !== "SUBMITTED" && sa.status !== "COMPLETED",
      submissions: sa.submissions.map(
        (s): SubmissionDto => ({ id: s.id, kind: s.kind, text: s.text, fileName: s.fileName, mimeType: s.mimeType, at: s.createdAt.toISOString() }),
      ),
      feedback: sa.feedback.map(
        (f): FeedbackDto => ({ id: f.id, result: f.result, comment: f.comment, teacher: f.teacher.displayName, at: f.createdAt.toISOString() }),
      ),
    })),
  };
}
