import { DateTime } from "luxon";
import { IST } from "@/lib/time";

// Deterministic resolution of a teacher's request: code decides classes, subject and the due time.
// The model only supplies hints (class names, a YYYY-MM-DD date, a time-of-day word, a clock time).
// Pure functions, unit-tested with a fixed "now".

export type TimeOfDay = "morning" | "afternoon" | "evening";

/** DESIGN.md §6: morning/afternoon/evening map to fixed times. */
export const TIME_OF_DAY: Record<TimeOfDay, string> = { morning: "08:00", afternoon: "14:00", evening: "18:00" };

export type DueParts = { dueDate: string | null; timeOfDay: TimeOfDay | null; explicitTime: string | null };

export type DueResolution =
  | { kind: "ok"; dueAt: DateTime }
  | { kind: "need_date" }
  | { kind: "need_time"; date: string }
  | { kind: "past"; dueAt: DateTime };

/** Explicit time wins, then time of day; no date → ask; no time → ask; past → reject. All in IST. */
export function resolveDue(parts: DueParts, now: DateTime): DueResolution {
  if (!parts.dueDate) return { kind: "need_date" };
  const time = parts.explicitTime ?? (parts.timeOfDay ? TIME_OF_DAY[parts.timeOfDay] : null);
  if (!time) return { kind: "need_time", date: parts.dueDate };
  const dueAt = DateTime.fromISO(`${parts.dueDate}T${time}`, { zone: IST });
  if (!dueAt.isValid) return { kind: "need_date" };
  if (dueAt <= now) return { kind: "past", dueAt };
  return { kind: "ok", dueAt };
}

// ───────────────────── Parsing short typed answers ("4pm", "Friday") ─────────────────────

/** "4pm", "4 pm", "4:30pm", "16:30", "16.30", "8 am", "noon" → "HH:mm". A bare "4" is ambiguous → null. */
export function parseClock(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (/\bnoon\b/.test(t)) return "12:00";
  const ampm = t.match(/\b(\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a\.m\.|p\.m\.)/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const pm = ampm[3].startsWith("p");
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const h24 = t.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (h24) return `${h24[1].padStart(2, "0")}:${h24[2]}`;
  return null;
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function timeOfDayIn(t: string): TimeOfDay | null {
  if (/\bmorning\b/.test(t)) return "morning";
  if (/\bafternoon\b/.test(t)) return "afternoon";
  if (/\b(evening|tonight)\b/.test(t)) return "evening";
  return null;
}

/** First date ≥ today with this day/month (rolls into next year if already past). */
function upcoming(now: DateTime, month: number, day: number): DateTime | null {
  let d = DateTime.fromObject({ year: now.year, month, day }, { zone: IST });
  if (!d.isValid) return null;
  if (d < now.startOf("day")) d = d.plus({ years: 1 });
  return d;
}

/**
 * Parses a typed due-date answer: "today", "tomorrow", "day after", "Friday", "next Friday",
 * "23 Nov", "Nov 23", "23/11", "2026-11-23", optionally with a time ("tomorrow evening", "Mon 4pm").
 * Weekdays mean the first such day strictly after today (same rule as the model prompt).
 */
export function parseDueText(text: string, now: DateTime): DueParts | null {
  const t = text.trim().toLowerCase();
  const today = now.setZone(IST).startOf("day");
  let date: DateTime | null = null;

  if (/\bday after( tomorrow)?\b/.test(t)) date = today.plus({ days: 2 });
  else if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) date = today.plus({ days: 1 });
  else if (/\btoday\b|\btonight\b/.test(t)) date = today;

  if (!date) {
    const weekday = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w.slice(0, 3)}(${w.slice(3)})?\\b`).test(t));
    if (weekday >= 0) {
      const diff = (weekday + 1 - today.weekday + 7) % 7 || 7; // strictly after today
      date = today.plus({ days: diff });
    }
  }
  if (!date) {
    const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)? ?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
    const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* ?(\d{1,2})(?:st|nd|rd|th)?\b/);
    const slash = t.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
    if (iso) date = DateTime.fromISO(`${iso[1]}-${iso[2]}-${iso[3]}`, { zone: IST });
    else if (dm) date = upcoming(today, MONTHS.indexOf(dm[2]) + 1, Number(dm[1]));
    else if (md) date = upcoming(today, MONTHS.indexOf(md[1]) + 1, Number(md[2]));
    else if (slash) date = upcoming(today, Number(slash[2]), Number(slash[1])); // Indian order: day/month
  }
  if (!date || !date.isValid) return null;

  return { dueDate: date.toISODate(), timeOfDay: timeOfDayIn(t), explicitTime: parseClock(t) };
}

// ───────────────────────────── Class and subject ─────────────────────────────

export type TeachingSlot = { classId: string; className: string; subject: string };

export type TargetResolution =
  | { kind: "ok"; subject: string; classes: { id: string; name: string }[] }
  | { kind: "ask_subject"; options: string[] }
  | { kind: "ask_class"; subject: string; options: { id: string; name: string }[] }
  | { kind: "not_teaching"; subject: string; className?: string }
  | { kind: "no_classes" };

const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
const sameSubject = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Picks subject and classes from the teacher's SUBJECT_TEACHER memberships.
 * One subject → use it. One class for the subject → use it. Several and none named → ask.
 * A named class/subject they don't teach → not_teaching.
 */
export function resolveTarget(
  hint: { subject: string | null; classNames: string[] },
  slots: TeachingSlot[],
): TargetResolution {
  if (slots.length === 0) return { kind: "no_classes" };
  const subjects = [...new Set(slots.map((s) => s.subject))];
  const named = [...new Set(hint.classNames.map(norm))];

  let subject: string | undefined;
  if (hint.subject) {
    subject = subjects.find((s) => sameSubject(s, hint.subject!));
    if (!subject) return { kind: "not_teaching", subject: hint.subject, className: named[0] };
  } else if (subjects.length === 1) {
    subject = subjects[0];
  } else {
    // Subjects taught in every named class; one candidate → use it.
    const inNamed = named.length
      ? subjects.filter((s) => named.every((n) => slots.some((x) => x.subject === s && norm(x.className) === n)))
      : subjects;
    if (inNamed.length === 1) subject = inNamed[0];
    else return { kind: "ask_subject", options: inNamed.length ? inNamed : subjects };
  }

  const forSubject = slots.filter((s) => s.subject === subject);
  if (named.length > 0) {
    const classes: { id: string; name: string }[] = [];
    for (const n of named) {
      const slot = forSubject.find((s) => norm(s.className) === n);
      if (!slot) return { kind: "not_teaching", subject, className: n };
      classes.push({ id: slot.classId, name: slot.className });
    }
    return { kind: "ok", subject, classes };
  }
  const options = forSubject.map((s) => ({ id: s.classId, name: s.className })).sort((a, b) => a.name.localeCompare(b.name));
  if (options.length === 1) return { kind: "ok", subject, classes: options };
  return { kind: "ask_class", subject, options };
}

/** New due time for a change: new date and/or new time; whatever isn't given keeps the old value. */
export function resolveChangedDue(
  oldDueAt: DateTime,
  change: DueParts,
  now: DateTime,
): { kind: "ok"; dueAt: DateTime } | { kind: "unchanged" } | { kind: "past"; dueAt: DateTime } {
  const old = oldDueAt.setZone(IST);
  const time = change.explicitTime ?? (change.timeOfDay ? TIME_OF_DAY[change.timeOfDay] : null);
  if (!change.dueDate && !time) return { kind: "unchanged" };
  const date = change.dueDate ?? old.toISODate()!;
  const dueAt = DateTime.fromISO(`${date}T${time ?? old.toFormat("HH:mm")}`, { zone: IST });
  if (dueAt <= now) return { kind: "past", dueAt };
  return { kind: "ok", dueAt };
}

// ───────────────────── Never trust a guessed subject or class ─────────────────────

/** Words a teacher may use for a subject (lowercase). Unknown subjects match their own name. */
export const SUBJECT_ALIASES: Record<string, string[]> = {
  maths: ["maths", "math", "mathematics"],
  mathematics: ["maths", "math", "mathematics"],
  science: ["science", "sci"],
  english: ["english", "eng"],
  hindi: ["hindi"],
  "social studies": ["social studies", "social science", "social", "sst"],
  computer: ["computer", "computers", "computer science", "cs", "ict"],
  physics: ["physics", "phy"],
  chemistry: ["chemistry", "chem"],
  biology: ["biology", "bio"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True if the message names this subject (or a common alias) as a whole word. */
export function mentionsSubject(text: string, subject: string): boolean {
  const key = subject.trim().toLowerCase();
  const words = SUBJECT_ALIASES[key] ?? [key];
  return words.some((w) => new RegExp(`(^|[^a-z])${escapeRe(w).replace(/ /g, "\\s+")}([^a-z]|$)`, "i").test(text));
}

/** True if the message names this class: "8A", "8 A", "8a", "8-A". */
export function mentionsClass(text: string, className: string): boolean {
  const m = className.trim().match(/^(\d+)\s*-?\s*([A-Za-z]+)$/);
  const pattern = m ? `${m[1]}\\s*-?\\s*${escapeRe(m[2])}` : escapeRe(className.trim());
  return new RegExp(`(^|[^0-9a-z])${pattern}([^0-9a-z]|$)`, "i").test(text);
}

/**
 * The model may only fill subject/class when the teacher wrote them. Keep its subject only if the
 * subject's name or an alias is in the text, and each class only if it is in the text; anything
 * else becomes "missing", so code asks instead of guessing (e.g. from "diagrams" or "exercise 4.5").
 */
export function verifyTargetHints(text: string, hint: { subject: string | null; classNames: string[] }): { subject: string | null; classNames: string[] } {
  return {
    subject: hint.subject && mentionsSubject(text, hint.subject) ? hint.subject : null,
    classNames: hint.classNames.filter((c) => mentionsClass(text, c)),
  };
}
