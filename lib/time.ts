import { DateTime } from "luxon";
import { getEnv } from "@/lib/env";

// All time logic runs in IST. Store UTC in the DB (JS Date), convert here for display and rules.
export const IST = "Asia/Kolkata";

export type QuietHours = { start: number; end: number };

export function nowIst(): DateTime {
  return DateTime.now().setZone(IST);
}

export function toIst(date: Date | DateTime): DateTime {
  return (date instanceof Date ? DateTime.fromJSDate(date) : date).setZone(IST);
}

/** "Thu 19 Nov, 8:00 am" */
export function formatIst(date: Date | DateTime): string {
  return toIst(date)
    .toFormat("ccc d LLL, h:mm a")
    .replace(/AM$/, "am")
    .replace(/PM$/, "pm");
}

export function getQuietHours(): QuietHours {
  const env = getEnv();
  return { start: env.QUIET_HOURS_START, end: env.QUIET_HOURS_END };
}

/** True when `date` falls in student quiet hours (default 21:00-07:00 IST). Handles windows crossing midnight. */
export function isQuietHours(date: Date | DateTime, quiet: QuietHours = getQuietHours()): boolean {
  const hour = toIst(date).hour;
  if (quiet.start === quiet.end) return false;
  return quiet.start > quiet.end
    ? hour >= quiet.start || hour < quiet.end // e.g. 21 → 7, crosses midnight
    : hour >= quiet.start && hour < quiet.end;
}

/** The next time quiet hours end (QUIET_HOURS_END:00 IST) strictly after `date`. */
export function nextQuietHoursEnd(date: Date | DateTime, quiet: QuietHours = getQuietHours()): DateTime {
  const ist = toIst(date);
  const today = ist.set({ hour: quiet.end, minute: 0, second: 0, millisecond: 0 });
  return today > ist ? today : today.plus({ days: 1 });
}
