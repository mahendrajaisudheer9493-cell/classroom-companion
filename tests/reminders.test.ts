import { describe, expect, it } from "vitest";
import {
  blockedCheckinAt,
  computeDueReminders,
  heldBecauseBlocked,
  overdueAt,
  relativeDue,
  reminderDedupeKey,
  reminderPayload,
  type ReminderItem,
  type ReminderRow,
  type ReminderSettings,
} from "@/lib/domain/reminders";
import { describeTick, type TickSummary } from "@/lib/domain/tick";

// Fixed clock: Wed 18 Nov 2026, 10:00 IST (04:30 UTC).
const now = new Date("2026-11-18T04:30:00Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

const PILOT: ReminderSettings = { silentAfterMinutes: 720, dueSoonHour: 18, blockedCheckinAfterMinutes: null, demoMode: false, quietHours: { start: 21, end: 7 } };
const DEMO: ReminderSettings = { ...PILOT, silentAfterMinutes: 2, blockedCheckinAfterMinutes: 2, demoMode: true };

let n = 0;
function row(overrides: Partial<ReminderRow>): ReminderRow {
  n++;
  return {
    saId: `sa${n}`,
    studentId: `st${n}`,
    studentName: `Student ${n}`,
    linked: true,
    classId: "c8a",
    assignmentId: `a${n}`,
    assignmentStatus: "PUBLISHED",
    subject: "Maths",
    title: "Exercise 4.2",
    dueAt: ist("2026-11-20T08:00:00"), // Fri, two days away
    version: 1,
    status: "ACKNOWLEDGED",
    deliveredAt: minutesAgo(60),
    lastStudentActivityAt: minutesAgo(50),
    blockedAt: null,
    ...overrides,
  };
}
const kinds = (rows: ReminderRow[], at = now, s = PILOT) => computeDueReminders(at, rows, s).map((d) => d.kind);

describe("reminder rules (fixed clock)", () => {
  it("silent fires only after SILENT_AFTER_MINUTES with no activity", () => {
    const quiet11h = row({ status: "ASSIGNED", deliveredAt: minutesAgo(11 * 60), lastStudentActivityAt: null });
    const quiet12h = row({ status: "ASSIGNED", deliveredAt: minutesAgo(12 * 60), lastStudentActivityAt: null });
    const activeRecently = row({ status: "ASSIGNED", deliveredAt: minutesAgo(13 * 60), lastStudentActivityAt: minutesAgo(30) });
    expect(kinds([quiet11h])).toEqual([]);
    expect(computeDueReminders(now, [quiet12h], PILOT)).toEqual([{ studentId: quiet12h.studentId, saId: quiet12h.saId, kind: "silent", key: `silent:${quiet12h.saId}:v1` }]);
    expect(kinds([activeRecently])).toEqual([]);
    // demo: 2 minutes
    expect(kinds([row({ status: "ASSIGNED", deliveredAt: minutesAgo(1), lastStudentActivityAt: null })], now, DEMO)).toEqual([]);
    expect(kinds([row({ status: "ASSIGNED", deliveredAt: minutesAgo(2), lastStudentActivityAt: null })], now, DEMO)).toEqual(["silent"]);
  });

  it("only for linked students, delivered cards and published assignments", () => {
    const base = { status: "ASSIGNED" as const, deliveredAt: minutesAgo(800), lastStudentActivityAt: null };
    expect(kinds([row({ ...base, linked: false })])).toEqual([]);
    expect(kinds([row({ ...base, deliveredAt: null })])).toEqual([]);
    expect(kinds([row({ ...base, assignmentStatus: "CANCELLED" })])).toEqual([]);
  });

  it("due_soon fires from 18:00 IST the day before until the deadline", () => {
    const due = ist("2026-11-19T08:00:00"); // Thu 8:00 am
    const r = row({ status: "IN_PROGRESS", dueAt: due });
    expect(kinds([r], ist("2026-11-18T17:59:00"))).toEqual([]);
    expect(kinds([r], ist("2026-11-18T18:00:00"))).toEqual(["due_soon"]);
    expect(kinds([r], ist("2026-11-19T07:30:00"))).toEqual(["due_soon"]);
    expect(kinds([row({ status: "ASSIGNED", dueAt: due, deliveredAt: ist("2026-11-18T17:00:00"), lastStudentActivityAt: null })], ist("2026-11-18T18:30:00"))).toEqual([]); // ASSIGNED: not due_soon
  });

  it("a blocked student gets the check-in but never due_soon or overdue", () => {
    const blockedAt = ist("2026-11-17T16:00:00"); // Tue 4 pm → check-in Wed 07:00
    const blockedDueSoon = row({ status: "BLOCKED", blockedAt, dueAt: ist("2026-11-19T08:00:00") });
    const blockedOverdue = row({ status: "BLOCKED", blockedAt, dueAt: ist("2026-11-16T08:00:00") });
    expect(blockedCheckinAt(blockedAt, PILOT)).toEqual(ist("2026-11-18T07:00:00"));
    expect(kinds([blockedDueSoon], ist("2026-11-18T06:59:00"), { ...PILOT, quietHours: null })).toEqual([]);
    expect(kinds([blockedDueSoon, blockedOverdue], ist("2026-11-18T19:00:00"))).toEqual(["blocked_checkin", "blocked_checkin"]);
    const [d] = computeDueReminders(now, [blockedDueSoon], PILOT);
    expect(d.key).toBe(`blocked:${blockedDueSoon.saId}:${blockedAt.toISOString()}`); // once per stuck episode
    expect(heldBecauseBlocked(now, [blockedDueSoon, row({})], PILOT)).toHaveLength(1);
    // demo: N minutes after blocking
    expect(kinds([row({ status: "BLOCKED", blockedAt: minutesAgo(1) })], now, DEMO)).toEqual([]);
    expect(kinds([row({ status: "BLOCKED", blockedAt: minutesAgo(2) })], now, DEMO)).toEqual(["blocked_checkin"]);
  });

  it("overdue fires at 07:00 IST the day after the deadline (5 minutes after in demo mode)", () => {
    const due = ist("2026-11-17T08:00:00");
    expect(overdueAt(due, PILOT)).toEqual(ist("2026-11-18T07:00:00"));
    expect(overdueAt(due, DEMO)).toEqual(ist("2026-11-17T08:05:00"));
    const r = row({ status: "ACKNOWLEDGED", dueAt: due });
    expect(kinds([r], ist("2026-11-17T20:00:00"))).toEqual([]);
    expect(kinds([r], now)).toEqual(["overdue"]);
    expect(kinds([r], ist("2026-11-17T08:05:00"), DEMO)).toEqual(["overdue"]);
  });

  it("submitted, completed and needs-revision work gets nothing", () => {
    const overdueDue = ist("2026-11-10T08:00:00");
    for (const status of ["SUBMITTED", "COMPLETED", "NEEDS_REVISION"] as const) {
      expect(kinds([row({ status, dueAt: overdueDue, deliveredAt: minutesAgo(5000), lastStudentActivityAt: null })])).toEqual([]);
    }
  });

  it("nothing fires in quiet hours (21:00-07:00 IST) unless they are switched off", () => {
    const r = row({ status: "ASSIGNED", deliveredAt: minutesAgo(5000), lastStudentActivityAt: null });
    expect(kinds([r], ist("2026-11-18T22:00:00"))).toEqual([]);
    expect(kinds([r], ist("2026-11-18T06:59:00"))).toEqual([]);
    expect(heldBecauseBlocked(ist("2026-11-18T22:00:00"), [row({ status: "BLOCKED", blockedAt: minutesAgo(10) })], PILOT)).toEqual([]);
    expect(kinds([r], ist("2026-11-18T22:00:00"), { ...PILOT, quietHours: null })).toEqual(["silent"]);
  });
});

describe("reminder messages", () => {
  const item = (r: ReminderRow, kind: ReminderItem["kind"]): ReminderItem => ({ studentId: "st", saId: r.saId, kind, key: `${kind}:${r.saId}:v1`, row: r });

  it("one reminder → its own text and buttons", () => {
    const r = row({ dueAt: ist("2026-11-19T08:00:00") });
    const p = reminderPayload([item(r, "due_soon")], now, "school1");
    expect(p.text).toBe("Maths · Exercise 4.2 is due tomorrow at 8:00 am.");
    const labels = p.reply_markup!.inline_keyboard.flat().map((b) => b.text);
    expect(labels).toEqual(["Done", "I'm stuck", "Open"]);
    expect(p.meta?.reminder).toMatchObject({ kinds: ["due_soon"], wording: "template", schoolId: "school1" });
  });

  it("overdue and check-in buttons", () => {
    const r = row({});
    const labels = (k: ReminderItem["kind"]) => reminderPayload([item(r, k)], now, "s").reply_markup!.inline_keyboard.flat().map((b) => b.text);
    expect(labels("overdue")).toEqual(["Submit now", "Bringing it today", "I'm stuck", "Open"]);
    expect(labels("blocked_checkin")).toEqual(["Still stuck", "Figured it out", "Open"]);
    expect(labels("silent")).toEqual(["Got it", "I'm stuck", "Open"]);
  });

  it("two reminders for one student → one merged message with [Open my work]", () => {
    const a = row({ title: "Exercise 4.2" });
    const b = row({ subject: "Science", title: "Lab report", dueAt: ist("2026-11-17T08:00:00") });
    const p = reminderPayload([item(a, "silent"), item(b, "overdue")], now, "s");
    expect(p.text).toBe(
      "You have 2 things to look at:\n• Maths · Exercise 4.2: did you see it? Due Fri 20 Nov, 8:00 am\n• Science · Lab report: was due yesterday at 8:00 am",
    );
    expect(p.reply_markup!.inline_keyboard.flat().map((b) => b.text)).toEqual(["Open my work"]);
    expect(p.meta?.reminder?.saIds).toEqual([a.saId, b.saId]);
    // the dedupe key doesn't depend on order
    expect(reminderDedupeKey("st", ["x", "y"])).toBe(reminderDedupeKey("st", ["y", "x"]));
  });

  it("relative due text", () => {
    expect(relativeDue(now, ist("2026-11-18T20:00:00"))).toBe("today at 8:00 pm");
    expect(relativeDue(now, ist("2026-11-19T08:00:00"))).toBe("tomorrow at 8:00 am");
    expect(relativeDue(now, ist("2026-11-23T08:00:00"))).toBe("on Mon 23 Nov at 8:00 am");
  });
});

describe("[Run reminders now] in plain words", () => {
  const summary = (over: Partial<TickSummary["details"]> = {}): TickSummary => ({
    reminders: { silent: 1, due_soon: 0, blocked_checkin: 1, overdue: 0, skippedBlocked: 1 },
    digests: 0,
    queue: { sent: 2, failed: 0, dead: 0, deferred: 0 },
    details: {
      fired: [
        { studentName: "Anu", kind: "silent", classId: "c8a", subject: "Maths" },
        { studentName: "Ravi", kind: "blocked_checkin", classId: "c8a", subject: "Maths" },
        { studentName: "Someone", kind: "silent", classId: "c9b", subject: "English" },
      ],
      held: [{ studentName: "Ravi", classId: "c8a", subject: "Maths" }],
      quietHours: false,
      ...over,
    },
  });
  const mine = (classId: string, subject: string) => classId === "c8a" && subject === "Maths";

  it("names only the teacher's own students", () => {
    expect(describeTick(summary(), mine)).toBe(
      "Sent: 1 'did you see it?' to Anu · 1 'still stuck?' to Ravi · 1 reminder for other classes · Ravi is stuck, so no submit reminders · 2 messages delivered.",
    );
  });

  it("says when nothing is due, and when quiet hours hold everything", () => {
    const empty = { ...summary({ fired: [], held: [] }), queue: { sent: 0, failed: 0, dead: 0, deferred: 0 } };
    expect(describeTick(empty, mine)).toBe("No reminders due right now.");
    expect(describeTick({ ...empty, details: { fired: [], held: [], quietHours: true } }, mine)).toBe(
      "Quiet hours: student reminders wait until 7:00 am.",
    );
  });
});
