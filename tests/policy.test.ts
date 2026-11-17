import { describe, expect, it } from "vitest";
import {
  AccessDenied,
  assertAccess,
  canManageClassSubject,
  canManageRoster,
  canViewClassFull,
  canViewSchoolStatuses,
  canViewStudentAssignment,
  type AccessUser,
} from "@/lib/access/policy";

// Same shape as prisma/seed.ts
const GF = "greenfield", RS = "riverside";
const C8A = "c8a", C8B = "c8b", C7A = "c7a";
const RAVI = "ravi", ANU = "anu", RAHUL = "rahul", ASHA = "asha";

const lakshmi: AccessUser = {
  id: "lakshmi",
  student: null,
  memberships: [
    { schoolId: GF, classId: C8A, role: "SUBJECT_TEACHER", subject: "Maths" },
    { schoolId: GF, classId: C8B, role: "SUBJECT_TEACHER", subject: "Maths" },
    { schoolId: GF, classId: C8A, role: "CLASS_TEACHER", subject: null },
  ],
};
const meera: AccessUser = {
  id: "meera",
  student: null,
  memberships: [{ schoolId: GF, classId: null, role: "COORDINATOR", subject: null }],
};
const arjun: AccessUser = {
  id: "arjun",
  student: null,
  memberships: [{ schoolId: GF, classId: C8B, role: "SUBJECT_TEACHER", subject: "English" }],
};
const ravi: AccessUser = { id: "ravi-user", memberships: [], student: { id: RAVI, schoolId: GF, classId: C8A } };

const sa = (studentId: string, schoolId: string, classId: string, subject: string) => ({
  studentId,
  assignment: { schoolId, classId, subject },
});

describe("access policy (DESIGN.md §3)", () => {
  it("Maths teacher manages 8A Maths and 8B Maths, nothing else", () => {
    expect(canManageClassSubject(lakshmi, C8A, "Maths")).toBe(true);
    expect(canManageClassSubject(lakshmi, C8B, "Maths")).toBe(true);
    expect(canManageClassSubject(lakshmi, C8B, "English")).toBe(false);
    expect(canManageClassSubject(lakshmi, C8A, "English")).toBe(false);
  });

  it("Maths teacher cannot see 8B English (not class teacher of 8B)", () => {
    expect(canViewStudentAssignment(lakshmi, sa(RAHUL, GF, C8B, "English"))).toBe("none");
  });

  it("class teacher of 8A reads 8A English in full, but cannot manage it", () => {
    expect(canViewClassFull(lakshmi, C8A)).toBe(true);
    expect(canViewStudentAssignment(lakshmi, sa(ANU, GF, C8A, "English"))).toBe("full");
    expect(canManageClassSubject(lakshmi, C8A, "English")).toBe(false);
  });

  it("coordinator sees statuses across the school, never full content", () => {
    expect(canViewSchoolStatuses(meera, GF)).toBe(true);
    expect(canViewStudentAssignment(meera, sa(RAVI, GF, C8A, "Maths"))).toBe("status");
    expect(canViewStudentAssignment(meera, sa(RAHUL, GF, C8B, "English"))).toBe("status");
    expect(canManageRoster(meera, C8A)).toBe(false);
  });

  it("a teacher who is also coordinator gets full where they teach, status elsewhere", () => {
    const both: AccessUser = { ...lakshmi, memberships: [...lakshmi.memberships, ...meera.memberships] };
    expect(canViewStudentAssignment(both, sa(RAVI, GF, C8A, "Maths"))).toBe("full");
    expect(canViewStudentAssignment(both, sa(RAHUL, GF, C8B, "English"))).toBe("status");
  });

  it("Ravi sees only his own work", () => {
    expect(canViewStudentAssignment(ravi, sa(RAVI, GF, C8A, "Maths"))).toBe("full");
    expect(canViewStudentAssignment(ravi, sa(ANU, GF, C8A, "Maths"))).toBe("none");
    expect(canManageRoster(ravi, C8A)).toBe(false);
  });

  it("roster: subject or class teacher of that class only", () => {
    expect(canManageRoster(lakshmi, C8A)).toBe(true);
    expect(canManageRoster(lakshmi, C8B)).toBe(true);
    expect(canManageRoster(arjun, C8B)).toBe(true);
    expect(canManageRoster(arjun, C8A)).toBe(false);
  });

  it("nobody from Greenfield sees Riverside", () => {
    const riversideWork = sa(ASHA, RS, C7A, "Maths");
    for (const user of [lakshmi, meera, arjun, ravi]) {
      expect(canViewStudentAssignment(user, riversideWork)).toBe("none");
      expect(canManageRoster(user, C7A)).toBe(false);
      expect(canViewSchoolStatuses(user, RS)).toBe(false);
    }
  });

  it("assertAccess throws AccessDenied with context", () => {
    expect(() => assertAccess(false, "nope", { classId: C7A })).toThrow(AccessDenied);
    expect(() => assertAccess(true, "fine")).not.toThrow();
  });
});
