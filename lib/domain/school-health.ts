import type { ClassHealthResponse, HealthStatsDto, SchoolHealthResponse, SubjectDetailResponse } from "@/app/app/_lib/types";
import { assertAccess, canViewSchoolStatuses, type AccessUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import type { TeachingSlot } from "@/lib/domain/assignment-draft";
import { isOverdue, isStuck, loadTriageRows, type TriageRow } from "@/lib/domain/triage";
import { HttpError } from "@/lib/http";
import { formatIst } from "@/lib/time";

// Coordinator school health (C2): per class → per subject → per assignment, names + statuses only.
// The responses are built from TriageRow facts (dates, statuses, versions); they never include
// submission content, doubt text or feedback. Numbers are computed here, by code.

const DONE = ["SUBMITTED", "COMPLETED"];

/** Seen = delivered and acted on (not ASSIGNED), with no unacknowledged change (same rule as triage). */
export const hasSeen = (r: TriageRow) =>
  r.deliveredAt !== null && r.status !== "ASSIGNED" && !(r.ackedVersion !== null && r.ackedVersion < r.version);

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

export function healthStats(rows: TriageRow[], now: Date): HealthStatsDto {
  const delivered = rows.filter((r) => r.deliveredAt !== null);
  const open = new Set(rows.filter((r) => !DONE.includes(r.status)).map((r) => r.assignmentId));
  return {
    openAssignments: open.size,
    seenPct: pct(delivered.filter(hasSeen).length, delivered.length),
    overduePct: pct(rows.filter((r) => isOverdue(r, now)).length, rows.length),
    stuck: rows.filter(isStuck).length,
  };
}

/** Worst = highest % overdue, then most stuck. Only flagged if something is actually wrong. */
export function worstOf<T extends { id: string; stats: HealthStatsDto }>(items: T[]): string | null {
  const bad = items.filter((i) => (i.stats.overduePct ?? 0) > 0 || i.stats.stuck > 0);
  if (bad.length === 0) return null;
  bad.sort((a, b) => (b.stats.overduePct ?? 0) - (a.stats.overduePct ?? 0) || b.stats.stuck - a.stats.stuck);
  return bad[0].id;
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

/** The coordinator's school: the one asked for, or their first. 403 for any other school. */
async function loadSchool(user: AccessUser & { id: string }, schoolId?: string | null) {
  const id = schoolId ?? user.memberships.find((m) => m.role === "COORDINATOR")?.schoolId;
  assertAccess(!!id && canViewSchoolStatuses(user, id), "Only the school's coordinator can see school health.", {
    schoolId: id ?? undefined,
    actorUserId: user.id,
  });
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) throw new HttpError(404, { error: "not_found", message: "School not found." });
  return school;
}

async function loadClassForCoordinator(user: AccessUser & { id: string }, classId: string) {
  const klass = await prisma.class.findUnique({ where: { id: classId }, include: { school: true } });
  if (!klass) throw new HttpError(404, { error: "not_found", message: "Class not found." });
  assertAccess(canViewSchoolStatuses(user, klass.schoolId), "Only the school's coordinator can see school health.", {
    schoolId: klass.schoolId,
    classId: klass.id,
    actorUserId: user.id,
  });
  return klass;
}

/** Every (class, subject) with published work, as triage slots. */
export async function slotsFor(where: { schoolId?: string; classId?: string }): Promise<TeachingSlot[]> {
  const pairs = await prisma.assignment.findMany({
    where: { ...where, status: "PUBLISHED" },
    distinct: ["classId", "subject"],
    select: { classId: true, subject: true, class: { select: { name: true } } },
  });
  return pairs.map((p) => ({ classId: p.classId, className: p.class.name, subject: p.subject }));
}

async function linkCounts(classIds: string[]) {
  const [totals, linked] = await Promise.all([
    prisma.student.groupBy({ by: ["classId"], where: { classId: { in: classIds } }, _count: { _all: true } }),
    prisma.student.groupBy({ by: ["classId"], where: { classId: { in: classIds }, userId: { not: null } }, _count: { _all: true } }),
  ]);
  const get = (rows: typeof totals, id: string) => rows.find((r) => r.classId === id)?._count._all ?? 0;
  return (id: string) => ({ linked: get(linked, id), total: get(totals, id) });
}

export async function schoolHealth(user: AccessUser & { id: string }, schoolId?: string | null, now = new Date()): Promise<SchoolHealthResponse> {
  const school = await loadSchool(user, schoolId);
  const classes = await prisma.class.findMany({ where: { schoolId: school.id }, orderBy: { name: "asc" } });
  const rows = await loadTriageRows(await slotsFor({ schoolId: school.id }));
  const byClass = groupBy(rows, (r) => r.classId);
  const counts = await linkCounts(classes.map((c) => c.id));
  const items = classes.map((c) => ({ id: c.id, name: c.name, stats: healthStats(byClass.get(c.id) ?? [], now), ...counts(c.id) }));
  return { school: { id: school.id, name: school.name }, classes: items, worstClassId: worstOf(items) };
}

export async function classHealth(user: AccessUser & { id: string }, classId: string, now = new Date()): Promise<ClassHealthResponse> {
  const klass = await loadClassForCoordinator(user, classId);
  const rows = await loadTriageRows(await slotsFor({ classId }));
  const subjects = [...groupBy(rows, (r) => r.subject).entries()]
    .map(([subject, rs]) => ({ id: subject, subject, stats: healthStats(rs, now) }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
  const counts = (await linkCounts([classId]))(classId);
  return {
    school: { id: klass.school.id, name: klass.school.name },
    class: { id: klass.id, name: klass.name, ...counts },
    stats: healthStats(rows, now),
    subjects: subjects.map(({ subject, stats }) => ({ subject, stats })),
    worstSubject: worstOf(subjects),
  };
}

export async function subjectDetail(
  user: AccessUser & { id: string },
  classId: string,
  subject: string,
  now = new Date(),
): Promise<SubjectDetailResponse> {
  const klass = await loadClassForCoordinator(user, classId);
  const rows = await loadTriageRows([{ classId, className: klass.name, subject }]);
  const assignments = [...groupBy(rows, (r) => r.assignmentId).values()]
    .sort((a, b) => b[0].dueAt.getTime() - a[0].dueAt.getTime()) // latest due first
    .map((rs) => ({
      id: rs[0].assignmentId,
      title: rs[0].title,
      dueLabel: formatIst(rs[0].dueAt),
      stats: healthStats(rs, now),
      // Names and statuses only.
      students: rs
        .map((r) => ({ name: r.studentName, status: r.status, overdue: isOverdue(r, now), stuck: isStuck(r) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  return { class: { id: klass.id, name: klass.name }, subject, assignments };
}
