import type { Role } from "@prisma/client";

// THE access policy (docs/DESIGN.md §3). Pure functions: they only look at the user's memberships
// and linked student, never the DB, so they are easy to test. Every bot handler and API route
// must go through these (via lib/access/index.ts helpers). Hiding UI is never enough.

export type AccessMembership = {
  schoolId: string;
  classId: string | null;
  role: Role;
  subject: string | null;
};

export type AccessUser = {
  id: string;
  memberships: AccessMembership[];
  student: { id: string; schoolId: string; classId: string } | null;
};

/** The facts about a StudentAssignment that decide who may see it. */
export type StudentAssignmentScope = {
  studentId: string;
  assignment: { schoolId: string; classId: string; subject: string };
};

export type AccessLevel = "full" | "status" | "none";

const sameSubject = (a: string | null, b: string) => a !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Subject teacher of this class + subject: create, change, cancel, review, feedback, doubts. */
export function canManageClassSubject(user: AccessUser, classId: string, subject: string): boolean {
  return user.memberships.some(
    (m) => m.role === "SUBJECT_TEACHER" && m.classId === classId && sameSubject(m.subject, subject),
  );
}

/** Class teacher: reads everything in their class (all subjects), takes no actions. */
export function canViewClassFull(user: AccessUser, classId: string): boolean {
  return user.memberships.some((m) => m.role === "CLASS_TEACHER" && m.classId === classId);
}

/** Coordinator: names + statuses across the school, no submission content or feedback. */
export function canViewSchoolStatuses(user: AccessUser, schoolId: string): boolean {
  return user.memberships.some((m) => m.role === "COORDINATOR" && m.schoolId === schoolId);
}

/** Coordinator setup (classes, invites, class teachers, memberships): only in their own school. */
export function canManageSchool(user: AccessUser, schoolId: string): boolean {
  return canViewSchoolStatuses(user, schoolId);
}

export type StudentWorkScope = { all: true } | { all: false; subjects: string[] };

/**
 * Whose work page (/app/students/:id) this user may open, and how much of it:
 * the student themselves and their class teacher see every subject; their subject teachers see only
 * their own subjects; everyone else (incl. a coordinator, who uses the school view) gets null.
 */
export function studentWorkScope(user: AccessUser, student: { id: string; classId: string }): StudentWorkScope | null {
  if (user.student?.id === student.id) return { all: true };
  if (canViewClassFull(user, student.classId)) return { all: true };
  const subjects = user.memberships.flatMap((m) =>
    m.role === "SUBJECT_TEACHER" && m.classId === student.classId && m.subject ? [m.subject] : [],
  );
  return subjects.length > 0 ? { all: false, subjects } : null;
}

export function scopeAllowsSubject(scope: StudentWorkScope, subject: string): boolean {
  return scope.all || scope.subjects.some((s) => sameSubject(s, subject));
}

/** Roster, class link, regenerate code, unlink: any subject or class teacher of that class. */
export function canManageRoster(user: AccessUser, classId: string): boolean {
  return user.memberships.some(
    (m) => (m.role === "SUBJECT_TEACHER" || m.role === "CLASS_TEACHER") && m.classId === classId,
  );
}

/**
 * How much of one student's work this user may see.
 * full = content incl. submissions & feedback (actions still need canManageClassSubject);
 * status = name + status only (coordinator); none = nothing.
 */
export function canViewStudentAssignment(user: AccessUser, sa: StudentAssignmentScope): AccessLevel {
  const { schoolId, classId, subject } = sa.assignment;
  if (user.student?.id === sa.studentId) return "full";
  if (canManageClassSubject(user, classId, subject)) return "full";
  if (canViewClassFull(user, classId)) return "full"; // read-only
  if (canViewSchoolStatuses(user, schoolId)) return "status";
  return "none";
}

export class AccessDenied extends Error {
  constructor(
    message: string,
    public context: { schoolId?: string; classId?: string; actorUserId?: string } = {},
  ) {
    super(message);
    this.name = "AccessDenied";
  }
}

/** Throws AccessDenied unless `allowed`. API routes turn it into 403 and log access.denied. */
export function assertAccess(
  allowed: boolean,
  message: string,
  context: AccessDenied["context"] = {},
): asserts allowed {
  if (!allowed) throw new AccessDenied(message, context);
}
