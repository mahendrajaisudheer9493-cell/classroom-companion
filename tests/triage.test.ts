import { describe, expect, it } from "vitest";
import { computeTriage, type TriageRow } from "@/lib/domain/triage";

// Fixed clock: Wed 18 Nov 2026, 10:00 IST (04:30 UTC). Silent after 12 h.
const now = new Date("2026-11-18T04:30:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const SILENT = { silentAfterMinutes: 720 };

let n = 0;
function row(overrides: Partial<TriageRow>): TriageRow {
  n++;
  return {
    saId: `sa${n}`,
    studentId: `st${n}`,
    studentName: `Student ${n}`,
    linked: true,
    classId: "c8a",
    className: "8A",
    assignmentId: "a1",
    subject: "Maths",
    title: "Exercise 4.2",
    dueAt: new Date(now.getTime() + 24 * 3_600_000), // tomorrow
    version: 1,
    status: "ACKNOWLEDGED",
    ackedVersion: 1,
    deliveredAt: hoursAgo(20),
    lastStudentActivityAt: hoursAgo(19),
    blockedAt: null,
    lastStudentDoubtAt: null,
    lastTeacherReplyAt: null,
    latestSubmissionAt: null,
    latestFeedbackAt: null,
    ...overrides,
  };
}

describe("triage grouping (fixed clock)", () => {
  it("a student with nothing to do appears nowhere", () => {
    const t = computeTriage([row({})], now, SILENT);
    expect(t.counts).toEqual({ stuck: 0, silent: 0, overdue: 0, toReview: 0 });
  });

  it("stuck: BLOCKED, or a question newer than the teacher's last reply; oldest first", () => {
    const blockedLater = row({ status: "BLOCKED", blockedAt: hoursAgo(1), studentName: "Later" });
    const blockedEarlier = row({ status: "BLOCKED", blockedAt: hoursAgo(5), studentName: "Earlier" });
    const unanswered = row({ lastStudentDoubtAt: hoursAgo(2), lastTeacherReplyAt: hoursAgo(3) });
    const answered = row({ lastStudentDoubtAt: hoursAgo(3), lastTeacherReplyAt: hoursAgo(2) });
    const t = computeTriage([blockedLater, blockedEarlier, unanswered, answered], now, SILENT);
    expect(t.stuck.map((i) => i.saId)).toEqual([blockedEarlier.saId, unanswered.saId, blockedLater.saId]);
    expect(t.stuck.find((i) => i.saId === unanswered.saId)?.flags).toContain("unanswered_question");
  });

  it("silent: delivered, still ASSIGNED, no activity for 12 h since delivery", () => {
    const silent = row({ status: "ASSIGNED", ackedVersion: null, deliveredAt: hoursAgo(13), lastStudentActivityAt: null });
    const tooEarly = row({ status: "ASSIGNED", ackedVersion: null, deliveredAt: hoursAgo(11), lastStudentActivityAt: null });
    const notDelivered = row({ status: "ASSIGNED", ackedVersion: null, deliveredAt: null, lastStudentActivityAt: null });
    const acked = row({ status: "ACKNOWLEDGED", deliveredAt: hoursAgo(30) });
    const t = computeTriage([silent, tooEarly, notDelivered, acked], now, SILENT);
    expect(t.silent.map((i) => i.saId)).toEqual([silent.saId]);
  });

  it("silent also lists 'hasn't seen the change' and 'not on Telegram yet', with tags", () => {
    const changed = row({ version: 2, ackedVersion: 1 });
    const unlinked = row({ status: "ASSIGNED", ackedVersion: null, linked: false, deliveredAt: null, lastStudentActivityAt: null });
    const t = computeTriage([changed, unlinked], now, SILENT);
    expect(t.silent.find((i) => i.saId === changed.saId)?.flags).toEqual(["hasnt_seen_change"]);
    expect(t.silent.find((i) => i.saId === unlinked.saId)?.flags).toEqual(["not_on_telegram"]);
  });

  it("overdue: due date passed and not submitted or completed", () => {
    const overdue = row({ dueAt: hoursAgo(1) });
    const submittedLate = row({ dueAt: hoursAgo(1), status: "SUBMITTED", latestSubmissionAt: hoursAgo(2) });
    const completed = row({ dueAt: hoursAgo(1), status: "COMPLETED" });
    const t = computeTriage([overdue, submittedLate, completed], now, SILENT);
    expect(t.overdue.map((i) => i.saId)).toEqual([overdue.saId]);
  });

  it("to review: SUBMITTED with no feedback after the latest submission", () => {
    const fresh = row({ status: "SUBMITTED", latestSubmissionAt: hoursAgo(1) });
    const resubmitted = row({ status: "SUBMITTED", latestSubmissionAt: hoursAgo(1), latestFeedbackAt: hoursAgo(5) });
    const reviewed = row({ status: "SUBMITTED", latestSubmissionAt: hoursAgo(5), latestFeedbackAt: hoursAgo(1) });
    const t = computeTriage([fresh, resubmitted, reviewed], now, SILENT);
    expect(t.toReview.map((i) => i.saId).sort()).toEqual([fresh.saId, resubmitted.saId].sort());
  });

  it("one student can be in several groups; counts are per group", () => {
    const both = row({ status: "BLOCKED", blockedAt: hoursAgo(30), dueAt: hoursAgo(2) });
    const t = computeTriage([both], now, SILENT);
    expect(t.counts).toEqual({ stuck: 1, silent: 0, overdue: 1, toReview: 0 });
    expect(t.stuck[0].flags).toContain("overdue");
  });
});
