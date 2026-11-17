import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { formatIst, isQuietHours, nextQuietHoursEnd } from "@/lib/time";

const quiet = { start: 21, end: 7 };
const ist = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata" });

describe("time helpers (IST)", () => {
  it("formats like 'Thu 19 Nov, 8:00 am'", () => {
    expect(formatIst(ist("2026-11-19T08:00"))).toBe("Thu 19 Nov, 8:00 am");
    expect(formatIst(ist("2026-11-19T17:30").toJSDate())).toBe("Thu 19 Nov, 5:30 pm");
  });

  it("knows quiet hours 21:00-07:00 across midnight", () => {
    expect(isQuietHours(ist("2026-11-19T20:59"), quiet)).toBe(false);
    expect(isQuietHours(ist("2026-11-19T21:00"), quiet)).toBe(true);
    expect(isQuietHours(ist("2026-11-20T03:00"), quiet)).toBe(true);
    expect(isQuietHours(ist("2026-11-20T06:59"), quiet)).toBe(true);
    expect(isQuietHours(ist("2026-11-20T07:00"), quiet)).toBe(false);
  });

  it("uses IST even when given a UTC Date", () => {
    // 16:00 UTC = 21:30 IST
    expect(isQuietHours(new Date("2026-11-19T16:00:00Z"), quiet)).toBe(true);
  });

  it("finds when quiet hours end", () => {
    expect(nextQuietHoursEnd(ist("2026-11-19T22:15"), quiet).toISO()).toBe("2026-11-20T07:00:00.000+05:30");
    expect(nextQuietHoursEnd(ist("2026-11-20T03:00"), quiet).toISO()).toBe("2026-11-20T07:00:00.000+05:30");
  });
});
