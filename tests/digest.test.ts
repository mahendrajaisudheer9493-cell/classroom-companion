import { describe, expect, it } from "vitest";
import { digestCounts, digestPayload, digestText, inDigestWindow } from "@/lib/domain/digest";
import { computeTriage, type TriageRow } from "@/lib/domain/triage";

// Fixed clock: Wed 18 Nov 2026, 10:00 IST.
const now = new Date("2026-11-18T04:30:00Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

let n = 0;
function row(overrides: Partial<TriageRow>): TriageRow {
  n++;
  return {
    saId: `sa${n}`, studentId: `st${n}`, studentName: `Student ${n}`, linked: true, classId: "c8a", className: "8A",
    assignmentId: "a1", subject: "Maths", title: "Exercise 4.2", dueAt: new Date(now.getTime() + 86_400_000), version: 1,
    status: "ACKNOWLEDGED", ackedVersion: 1, deliveredAt: hoursAgo(20), lastStudentActivityAt: hoursAgo(19), blockedAt: null,
    lastStudentDoubtAt: null, lastTeacherReplyAt: null, latestSubmissionAt: null, latestFeedbackAt: null,
    ...overrides,
  };
}
const counts = (rows: TriageRow[]) => digestCounts(computeTriage(rows, now, { silentAfterMinutes: 720 }));

describe("teacher morning digest", () => {
  it("is skipped when every count is zero", () => {
    const c = counts([row({}), row({ status: "COMPLETED" })]);
    expect(c).toEqual({ stuck: 0, silent: 0, overdue: 0, toReview: 0, hasntSeenChange: 0 });
    expect(digestText(c)).toBeNull();
  });

  it("uses the triage counts (code computes every number)", () => {
    const c = counts([
      row({ status: "BLOCKED", blockedAt: hoursAgo(2) }),
      row({ status: "ASSIGNED", lastStudentActivityAt: null }), // silent
      row({ version: 2, ackedVersion: 1 }), // hasn't seen the change (also listed as silent)
      row({ status: "IN_PROGRESS", dueAt: hoursAgo(3) }), // overdue
      row({ status: "SUBMITTED", latestSubmissionAt: hoursAgo(1) }), // to review
    ]);
    expect(c).toEqual({ stuck: 1, silent: 2, overdue: 1, toReview: 1, hasntSeenChange: 1 });
    expect(digestText(c)).toBe("Good morning! Today across your classes: 1 stuck · 2 silent · 1 overdue · 1 to review · 1 haven't seen a change.");
    expect(digestPayload("x").reply_markup!.inline_keyboard.flat().map((b) => b.text)).toEqual(["Open triage"]);
  });

  it("goes out from DIGEST_TIME for 3 hours (IST)", () => {
    expect(inDigestWindow(ist("2026-11-18T07:29:00"), "07:30")).toBe(false);
    expect(inDigestWindow(ist("2026-11-18T07:30:00"), "07:30")).toBe(true);
    expect(inDigestWindow(ist("2026-11-18T10:29:00"), "07:30")).toBe(true);
    expect(inDigestWindow(ist("2026-11-18T10:30:00"), "07:30")).toBe(false);
  });
});
