import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  parseClock,
  parseDueText,
  resolveChangedDue,
  resolveDue,
  resolveTarget,
  type TeachingSlot,
} from "@/lib/domain/assignment-draft";

// Fixed "now": Tuesday 17 Nov 2026, 10:00 IST
const now = DateTime.fromISO("2026-11-17T10:00", { zone: "Asia/Kolkata" });
const iso = (d: DateTime) => d.toISO({ suppressMilliseconds: true });

describe("due date/time resolution (IST)", () => {
  it('"day after" → Thu 19 Nov', () => {
    expect(parseDueText("day after", now)?.dueDate).toBe("2026-11-19");
    expect(parseDueText("bring it day after tomorrow", now)?.dueDate).toBe("2026-11-19");
  });

  it('"next Friday" / "Friday" → Fri 20 Nov (first Friday after today)', () => {
    expect(parseDueText("next Friday", now)?.dueDate).toBe("2026-11-20");
    expect(parseDueText("fri", now)?.dueDate).toBe("2026-11-20");
    expect(parseDueText("Tuesday", now)?.dueDate).toBe("2026-11-24"); // today is Tuesday → next week
  });

  it('"tomorrow evening" → Wed 18 Nov 18:00', () => {
    const parts = parseDueText("tomorrow evening", now)!;
    expect(parts).toEqual({ dueDate: "2026-11-18", timeOfDay: "evening", explicitTime: null });
    const r = resolveDue(parts, now);
    expect(r.kind === "ok" && iso(r.dueAt)).toBe("2026-11-18T18:00:00+05:30");
  });

  it("morning/afternoon map to 08:00/14:00", () => {
    const morning = resolveDue({ dueDate: "2026-11-19", timeOfDay: "morning", explicitTime: null }, now);
    const afternoon = resolveDue({ dueDate: "2026-11-19", timeOfDay: "afternoon", explicitTime: null }, now);
    expect(morning.kind === "ok" && iso(morning.dueAt)).toBe("2026-11-19T08:00:00+05:30");
    expect(afternoon.kind === "ok" && iso(afternoon.dueAt)).toBe("2026-11-19T14:00:00+05:30");
  });

  it('explicit "4pm" → 16:00 and wins over a time-of-day word', () => {
    expect(parseClock("4pm")).toBe("16:00");
    expect(parseClock("4:30 pm")).toBe("16:30");
    expect(parseClock("16:30")).toBe("16:30");
    expect(parseClock("8 am")).toBe("08:00");
    expect(parseClock("12 am")).toBe("00:00");
    expect(parseClock("4")).toBeNull(); // ambiguous
    const r = resolveDue({ dueDate: "2026-11-20", timeOfDay: "morning", explicitTime: "16:00" }, now);
    expect(r.kind === "ok" && iso(r.dueAt)).toBe("2026-11-20T16:00:00+05:30");
    expect(parseDueText("Mon 4pm", now)).toEqual({ dueDate: "2026-11-23", timeOfDay: null, explicitTime: "16:00" });
  });

  it("missing time → ask for time; missing date → ask for date", () => {
    expect(resolveDue({ dueDate: "2026-11-19", timeOfDay: null, explicitTime: null }, now)).toEqual({
      kind: "need_time",
      date: "2026-11-19",
    });
    expect(resolveDue({ dueDate: null, timeOfDay: "evening", explicitTime: null }, now)).toEqual({ kind: "need_date" });
  });

  it("past time → rejected", () => {
    expect(resolveDue({ dueDate: "2026-11-17", timeOfDay: "morning", explicitTime: null }, now).kind).toBe("past");
    expect(resolveDue({ dueDate: "2026-11-16", timeOfDay: null, explicitTime: "16:00" }, now).kind).toBe("past");
    expect(resolveDue({ dueDate: "2026-11-17", timeOfDay: null, explicitTime: "16:00" }, now).kind).toBe("ok"); // later today
  });

  it("parses typed calendar dates (day/month, Indian order)", () => {
    expect(parseDueText("23 Nov", now)?.dueDate).toBe("2026-11-23");
    expect(parseDueText("nov 23rd", now)?.dueDate).toBe("2026-11-23");
    expect(parseDueText("23/11", now)?.dueDate).toBe("2026-11-23");
    expect(parseDueText("5 Jan", now)?.dueDate).toBe("2027-01-05"); // already past this year → next year
    expect(parseDueText("whenever", now)).toBeNull();
  });
});

describe("changing a due date", () => {
  const old = DateTime.fromISO("2026-11-19T08:00", { zone: "Asia/Kolkata" });
  it("new date keeps the old time; new time keeps the old date", () => {
    const d = resolveChangedDue(old, { dueDate: "2026-11-23", timeOfDay: null, explicitTime: null }, now);
    expect(d.kind === "ok" && iso(d.dueAt)).toBe("2026-11-23T08:00:00+05:30");
    const t = resolveChangedDue(old, { dueDate: null, timeOfDay: "evening", explicitTime: null }, now);
    expect(t.kind === "ok" && iso(t.dueAt)).toBe("2026-11-19T18:00:00+05:30");
    expect(resolveChangedDue(old, { dueDate: null, timeOfDay: null, explicitTime: null }, now).kind).toBe("unchanged");
    expect(resolveChangedDue(old, { dueDate: "2026-11-16", timeOfDay: null, explicitTime: null }, now).kind).toBe("past");
  });
});

describe("class and subject resolution", () => {
  const lakshmi: TeachingSlot[] = [
    { classId: "c8a", className: "8A", subject: "Maths" },
    { classId: "c8b", className: "8B", subject: "Maths" },
  ];

  it("one subject, class named → that class", () => {
    expect(resolveTarget({ subject: null, classNames: ["8a"] }, lakshmi)).toEqual({
      kind: "ok",
      subject: "Maths",
      classes: [{ id: "c8a", name: "8A" }],
    });
  });

  it("several classes and none named → ask which class", () => {
    expect(resolveTarget({ subject: "maths", classNames: [] }, lakshmi)).toEqual({
      kind: "ask_class",
      subject: "Maths",
      options: [
        { id: "c8a", name: "8A" },
        { id: "c8b", name: "8B" },
      ],
    });
  });

  it("both classes named → one target per class", () => {
    const r = resolveTarget({ subject: "Maths", classNames: ["8A", "8B"] }, lakshmi);
    expect(r.kind === "ok" && r.classes.map((c) => c.name)).toEqual(["8A", "8B"]);
  });

  it("a class or subject they don't teach → not_teaching", () => {
    expect(resolveTarget({ subject: "Maths", classNames: ["7A"] }, lakshmi)).toEqual({
      kind: "not_teaching",
      subject: "Maths",
      className: "7A",
    });
    expect(resolveTarget({ subject: "English", classNames: ["8B"] }, lakshmi).kind).toBe("not_teaching");
  });

  it("several subjects: picks the only one taught in the named class, else asks", () => {
    const multi: TeachingSlot[] = [...lakshmi, { classId: "c8a", className: "8A", subject: "Science" }];
    expect(resolveTarget({ subject: null, classNames: ["8B"] }, multi)).toMatchObject({ kind: "ok", subject: "Maths" });
    expect(resolveTarget({ subject: null, classNames: ["8A"] }, multi)).toEqual({
      kind: "ask_subject",
      options: ["Maths", "Science"],
    });
  });

  it("no subject-teacher memberships → no_classes", () => {
    expect(resolveTarget({ subject: null, classNames: [] }, []).kind).toBe("no_classes");
  });
});
