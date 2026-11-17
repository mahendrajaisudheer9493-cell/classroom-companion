import { describe, expect, it } from "vitest";
import { canManageSchool, scopeAllowsSubject, studentWorkScope, type AccessUser } from "@/lib/access/policy";
import { groupLoad, problemSummary, strugglingFrom } from "@/lib/domain/class-views";
import { riskFrom } from "@/lib/domain/risk";
import { hasSeen, healthStats, worstOf } from "@/lib/domain/school-health";
import { parseRoster, rosterPreview } from "@/lib/domain/roster-parse";
import type { TriageRow } from "@/lib/domain/triage";

// Class teacher (CT1, CT2), coordinator (C1, C2) and at-risk logic with a fixed clock.
// Fixed clock: Wed 18 Nov 2026, 10:00 IST.
const now = new Date("2026-11-18T04:30:00Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

let n = 0;
function row(o: Partial<TriageRow>): TriageRow {
  n++;
  return {
    saId: `sa${n}`, studentId: "ravi", studentName: "Ravi", linked: true, classId: "c8a", className: "8A",
    assignmentId: `a${n}`, subject: "Maths", title: `Work ${n}`, dueAt: new Date(now.getTime() + 86_400_000), version: 1,
    status: "ACKNOWLEDGED", ackedVersion: 1, deliveredAt: hoursAgo(20), lastStudentActivityAt: hoursAgo(19), blockedAt: null,
    lastStudentDoubtAt: null, lastTeacherReplyAt: null, latestSubmissionAt: null, latestFeedbackAt: null,
    ...o,
  };
}

describe("CT1 class load", () => {
  it("groups by IST due date and flags 3+ on one day as heavy", () => {
    const days = groupLoad([
      { id: "1", subject: "Science", title: "Lab", dueAt: ist("2026-11-19T17:00:00") },
      { id: "2", subject: "Maths", title: "4.2", dueAt: ist("2026-11-19T08:00:00") },
      { id: "3", subject: "English", title: "Essay", dueAt: ist("2026-11-19T23:30:00") }, // still Thu in IST
      { id: "4", subject: "Maths", title: "4.3", dueAt: ist("2026-11-20T08:00:00") },
    ]);
    expect(days.map((d) => [d.label, d.items.map((i) => i.subject), d.heavy])).toEqual([
      ["Thu 19 Nov", ["Maths", "Science", "English"], true],
      ["Fri 20 Nov", ["Maths"], false],
    ]);
  });
});

describe("CT2 struggling in 2+ subjects", () => {
  it("lists students with problems in 2 or more subjects, naming them", () => {
    const rows = [
      row({ subject: "Maths", status: "BLOCKED", blockedAt: hoursAgo(3) }),
      row({ subject: "English", dueAt: hoursAgo(5) }), // overdue
      row({ studentId: "anu", studentName: "Anu", subject: "Maths", status: "BLOCKED", blockedAt: hoursAgo(1) }), // one subject only
    ];
    const s = strugglingFrom(rows, now, 720);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: "Ravi", summary: "stuck in Maths, overdue in English" });
  });

  it("'not on Telegram yet' isn't silence; overdue still counts for unlinked students", () => {
    const unlinked = { studentId: "kiran", studentName: "Kiran", linked: false, status: "ASSIGNED" as const, deliveredAt: null };
    expect(strugglingFrom([row({ ...unlinked, subject: "Maths" }), row({ ...unlinked, subject: "Science" })], now, 720)).toEqual([]);
    const s = strugglingFrom([row({ ...unlinked, subject: "Maths", dueAt: hoursAgo(2) }), row({ ...unlinked, subject: "English", dueAt: hoursAgo(2) })], now, 720);
    expect(s[0].summary).toBe("overdue in English and Maths");
  });

  it("summary joins subjects per problem", () => {
    expect(problemSummary([{ subject: "English", problems: ["overdue"] }, { subject: "Maths", problems: ["stuck", "overdue"] }])).toBe(
      "stuck in Maths, overdue in English and Maths",
    );
  });
});

describe("C2 school health numbers", () => {
  it("open, % seen (current version), % overdue, stuck", () => {
    const rows = [
      row({ assignmentId: "a", status: "ACKNOWLEDGED" }), // seen
      row({ assignmentId: "a", status: "IN_PROGRESS", version: 2, ackedVersion: 1 }), // hasn't seen the change
      row({ assignmentId: "a", status: "ASSIGNED", ackedVersion: null }), // not seen
      row({ assignmentId: "b", status: "COMPLETED", dueAt: hoursAgo(30) }), // done, not overdue
      row({ assignmentId: "c", status: "BLOCKED", blockedAt: hoursAgo(1), dueAt: hoursAgo(2) }), // stuck + overdue
      row({ assignmentId: "c", status: "ASSIGNED", ackedVersion: null, deliveredAt: null }), // not delivered: not in % seen
    ];
    expect(healthStats(rows, now)).toEqual({ openAssignments: 2, seenPct: 60, overduePct: 17, stuck: 1 });
    expect(hasSeen(rows[1])).toBe(false);
    expect(healthStats([], now)).toEqual({ openAssignments: 0, seenPct: null, overduePct: null, stuck: 0 });
  });

  it("worst class = highest % overdue, then most stuck; none when all is well", () => {
    const s = (overduePct: number | null, stuck: number) => ({ openAssignments: 1, seenPct: 90, overduePct, stuck });
    expect(worstOf([{ id: "8A", stats: s(10, 0) }, { id: "8B", stats: s(25, 0) }])).toBe("8B");
    expect(worstOf([{ id: "8A", stats: s(10, 3) }, { id: "8B", stats: s(10, 1) }])).toBe("8A");
    expect(worstOf([{ id: "8A", stats: s(0, 0) }, { id: "8B", stats: s(null, 0) }])).toBeNull();
  });
});

describe("C1 setup: roster paste", () => {
  it("new lines: blank lines and numbering dropped, order kept", () => {
    expect(parseRoster("Asha Gupta\n\n2. Vikram Singh\r\n 3) Meena Rao \n")).toEqual(["Asha Gupta", "Vikram Singh", "Meena Rao"]);
  });

  it("commas on one line (the 8D bug report), spaces trimmed", () => {
    expect(parseRoster("Test One, Test Two,Test Three")).toEqual(["Test One", "Test Two", "Test Three"]);
    expect(parseRoster("  Test   One  ,  ")).toEqual(["Test One"]);
  });

  it("mixed commas and new lines, empty entries ignored", () => {
    expect(parseRoster("A One, B Two\n\n,, C Three\n ,\nD Four;E Five")).toEqual(["A One", "B Two", "C Three", "D Four", "E Five"]);
    expect(parseRoster("\n , \n")).toEqual([]);
  });

  it("duplicates removed (ignoring case), first spelling kept", () => {
    expect(parseRoster("Test One\ntest one, TEST ONE\nTest Two")).toEqual(["Test One", "Test Two"]);
  });

  it("live preview text", () => {
    expect(rosterPreview(["Test One", "Test Two", "Test Three"])).toBe("3 students: Test One, Test Two, Test Three");
    expect(rosterPreview(["Solo"])).toBe("1 student: Solo");
    expect(rosterPreview(Array.from({ length: 10 }, (_, i) => `S${i}`))).toBe("10 students: S0, S1, S2, S3, S4, S5, S6, S7 and 2 more");
    expect(rosterPreview([])).toMatch(/^No names yet/);
  });
});

describe("access for the new screens", () => {
  const user = (memberships: AccessUser["memberships"], student: AccessUser["student"] = null): AccessUser => ({ id: "u", memberships, student });
  const ravi = { id: "ravi", classId: "c8a" };

  it("student page: class teacher all subjects; subject teacher own subjects; the student; nobody else", () => {
    const ct = user([{ schoolId: "gf", classId: "c8a", role: "CLASS_TEACHER", subject: null }]);
    const maths = user([{ schoolId: "gf", classId: "c8a", role: "SUBJECT_TEACHER", subject: "Maths" }]);
    const otherClass = user([{ schoolId: "gf", classId: "c8b", role: "SUBJECT_TEACHER", subject: "Maths" }]);
    const coordinator = user([{ schoolId: "gf", classId: null, role: "COORDINATOR", subject: null }]);
    const self = user([], { id: "ravi", schoolId: "gf", classId: "c8a" });
    const otherStudent = user([], { id: "anu", schoolId: "gf", classId: "c8a" });

    expect(studentWorkScope(ct, ravi)).toEqual({ all: true });
    expect(studentWorkScope(self, ravi)).toEqual({ all: true });
    const scope = studentWorkScope(maths, ravi)!;
    expect(scopeAllowsSubject(scope, "maths")).toBe(true);
    expect(scopeAllowsSubject(scope, "English")).toBe(false);
    expect(studentWorkScope(otherClass, ravi)).toBeNull();
    expect(studentWorkScope(coordinator, ravi)).toBeNull();
    expect(studentWorkScope(otherStudent, ravi)).toBeNull();
  });

  it("school setup: only the coordinator of that school", () => {
    const coordinator = user([{ schoolId: "gf", classId: null, role: "COORDINATOR", subject: null }]);
    expect(canManageSchool(coordinator, "gf")).toBe(true);
    expect(canManageSchool(coordinator, "riverside")).toBe(false);
    expect(canManageSchool(user([{ schoolId: "gf", classId: "c8a", role: "CLASS_TEACHER", subject: null }]), "gf")).toBe(false);
  });
});

describe("at risk this week", () => {
  it("needs 2 or more signals; one signal is not enough", () => {
    const stuck = row({ status: "BLOCKED", blockedAt: hoursAgo(2), title: "Ex 4.2" });
    expect(riskFrom([stuck], now, 720)).toEqual([]);
    const r = riskFrom([stuck, row({ status: "NEEDS_REVISION", title: "Ex 4.1" })], now, 720);
    expect(r).toHaveLength(1);
    expect(r[0].signals).toEqual(["stuck", "needs_revision"]);
    expect(r[0].reasons).toEqual(["stuck: Maths · Ex 4.2", "needs revision: Maths · Ex 4.1"]);
  });

  it("2 overdue items count on their own (overdue + 2+ overdue)", () => {
    const r = riskFrom([row({ dueAt: hoursAgo(5), title: "A" }), row({ dueAt: hoursAgo(30), title: "B" })], now, 720);
    expect(r[0].signals).toEqual(["overdue", "many_overdue"]);
    expect(r[0].reasons).toEqual(["overdue ×2: Maths · A, Maths · B"]);
  });

  it("only looks at this week (due within 7 days either side)", () => {
    const old = { dueAt: new Date(now.getTime() - 10 * 86_400_000) };
    expect(riskFrom([row({ ...old, title: "A" }), row({ ...old, title: "B" })], now, 720)).toEqual([]);
  });

  it("silent counts only for students on Telegram", () => {
    const quiet = { status: "ASSIGNED" as const, ackedVersion: null, lastStudentActivityAt: null, deliveredAt: hoursAgo(24) };
    expect(riskFrom([row({ ...quiet, linked: false, deliveredAt: null }), row({ dueAt: hoursAgo(1), linked: false })], now, 720)).toEqual([]);
    expect(riskFrom([row(quiet), row({ dueAt: hoursAgo(1) })], now, 720)[0].signals).toEqual(["overdue", "silent"]);
  });
});
