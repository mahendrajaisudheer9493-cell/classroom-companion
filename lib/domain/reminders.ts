import { createHash } from "node:crypto";
import { InlineKeyboard } from "grammy";
import type { StudentAssignmentStatus } from "@prisma/client";
import type { DateTime } from "luxon";
import { assignmentLabel } from "@/lib/bot/cards";
import { appUrl, callbackData, CB } from "@/lib/bot/keyboards";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { enqueue, type OutboundPayload } from "@/lib/queue/outbound";
import { formatIst, isQuietHours, toIst, type QuietHours } from "@/lib/time";

// State-aware student reminders (docs/DESIGN.md §10). computeDueReminders is pure (clock + rows in,
// reminders out) so every rule is unit-tested; runReminders reads the DB, records each reminder in
// ReminderFired (unique key → never twice), merges per student and queues one message each.

export type ReminderKind = "silent" | "due_soon" | "blocked_checkin" | "overdue";
export const REMINDER_KINDS: ReminderKind[] = ["silent", "due_soon", "blocked_checkin", "overdue"];

export type ReminderRow = {
  saId: string;
  studentId: string;
  studentName: string;
  linked: boolean;
  classId: string;
  assignmentId: string;
  assignmentStatus: string;
  subject: string;
  title: string;
  dueAt: Date;
  version: number;
  status: StudentAssignmentStatus;
  deliveredAt: Date | null;
  lastStudentActivityAt: Date | null;
  blockedAt: Date | null;
};

export type ReminderSettings = {
  silentAfterMinutes: number;
  dueSoonHour: number;
  /** Demo: check-in this many minutes after blocking. null → 07:00 IST the next morning. */
  blockedCheckinAfterMinutes: number | null;
  /** Demo: overdue fires 5 minutes after the deadline instead of 07:00 IST the next day. */
  demoMode: boolean;
  /** null = quiet hours switched off */
  quietHours: QuietHours | null;
};

export type DueReminder = { studentId: string; saId: string; kind: ReminderKind; key: string };

export function reminderSettings(): ReminderSettings {
  const env = getEnv();
  return {
    silentAfterMinutes: env.SILENT_AFTER_MINUTES,
    dueSoonHour: env.DUE_SOON_HOUR,
    blockedCheckinAfterMinutes: env.BLOCKED_CHECKIN_AFTER_MINUTES ?? null,
    demoMode: env.DEMO_MODE,
    quietHours: env.QUIET_HOURS_ENABLED ? { start: env.QUIET_HOURS_START, end: env.QUIET_HOURS_END } : null,
  };
}

// ───────────────────────────── When each reminder fires ─────────────────────────────

const MORNING_HOUR = 7;
const MINUTE = 60_000;
const NOT_REMINDED: StudentAssignmentStatus[] = ["SUBMITTED", "COMPLETED", "NEEDS_REVISION"];

const at = (d: DateTime, hour: number) => d.set({ hour, minute: 0, second: 0, millisecond: 0 });

/** The first 07:00 IST strictly after `date`. */
function nextMorning(date: Date): DateTime {
  const ist = toIst(date);
  const today = at(ist, MORNING_HOUR);
  return today > ist ? today : today.plus({ days: 1 });
}

/** Check-in time for a stuck student: 07:00 the next morning (at least an hour after), or N minutes in demo. */
export function blockedCheckinAt(blockedAt: Date, s: ReminderSettings): Date {
  if (s.blockedCheckinAfterMinutes !== null) return new Date(blockedAt.getTime() + s.blockedCheckinAfterMinutes * MINUTE);
  return nextMorning(new Date(blockedAt.getTime() + 60 * MINUTE)).toJSDate();
}

/** "Due tomorrow" window opens at DUE_SOON_HOUR on the day before the due date (IST). */
export function dueSoonFrom(dueAt: Date, s: ReminderSettings): Date {
  return at(toIst(dueAt).minus({ days: 1 }), s.dueSoonHour).toJSDate();
}

/** "Was due" fires at 07:00 IST the day after the deadline, or 5 minutes after it in demo mode. */
export function overdueAt(dueAt: Date, s: ReminderSettings): Date {
  if (s.demoMode) return new Date(dueAt.getTime() + 5 * MINUTE);
  return at(toIst(dueAt).plus({ days: 1 }), MORNING_HOUR).toJSDate();
}

/** Only linked students, delivered cards, published assignments, and work that isn't handed in. */
const isEligible = (r: ReminderRow) =>
  r.linked && r.deliveredAt !== null && r.assignmentStatus === "PUBLISHED" && !NOT_REMINDED.includes(r.status);

const inQuietHours = (now: Date, s: ReminderSettings) => s.quietHours !== null && isQuietHours(now, s.quietHours);

/** Every reminder due right now. Nothing during student quiet hours, so nothing piles up overnight. */
export function computeDueReminders(now: Date, rows: ReminderRow[], s: ReminderSettings): DueReminder[] {
  if (inQuietHours(now, s)) return [];
  const due: DueReminder[] = [];
  for (const r of rows) {
    if (!isEligible(r)) continue;
    const add = (kind: ReminderKind, key: string) => due.push({ studentId: r.studentId, saId: r.saId, kind, key });

    if (r.status === "BLOCKED") {
      // Stuck: only the "still stuck?" check-in, once per stuck episode. No submit/due/overdue nagging.
      if (r.blockedAt && now >= blockedCheckinAt(r.blockedAt, s)) add("blocked_checkin", `blocked:${r.saId}:${r.blockedAt.toISOString()}`);
      continue;
    }

    const quietSince = Math.max(r.deliveredAt!.getTime(), r.lastStudentActivityAt?.getTime() ?? 0);
    const silentLongEnough = now.getTime() - quietSince >= s.silentAfterMinutes * MINUTE;
    if (r.status === "ASSIGNED" && silentLongEnough && now < r.dueAt) add("silent", `silent:${r.saId}:v${r.version}`);

    const working = r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS";
    if (working && now >= dueSoonFrom(r.dueAt, s) && now < r.dueAt) add("due_soon", `due_soon:${r.saId}:v${r.version}`);

    if (now >= overdueAt(r.dueAt, s)) add("overdue", `overdue:${r.saId}:v${r.version}`);
  }
  return due;
}

/** Stuck students whose submit reminders are held back (reported by [Run reminders now]). */
export function heldBecauseBlocked(now: Date, rows: ReminderRow[], s: ReminderSettings): ReminderRow[] {
  if (inQuietHours(now, s)) return [];
  return rows.filter((r) => isEligible(r) && r.status === "BLOCKED");
}

// ───────────────────────────── Wording (code-built) ─────────────────────────────

const clock = (d: DateTime) => d.toFormat("h:mm a").replace(/AM$/, "am").replace(/PM$/, "pm");

/** "today at 8:00 pm", "tomorrow at 8:00 am", "yesterday at 8:00 am", "on Mon 9 Nov at 8:00 am" */
export function relativeDue(now: Date, dueAt: Date): string {
  const due = toIst(dueAt);
  const days = Math.round(due.startOf("day").diff(toIst(now).startOf("day"), "days").days);
  const word = days === 0 ? "today" : days === 1 ? "tomorrow" : days === -1 ? "yesterday" : `on ${due.toFormat("ccc d LLL")}`;
  return `${word} at ${clock(due)}`;
}

/** The due text each kind uses (also given to the model, which must not invent dates). */
export function dueTextFor(kind: ReminderKind, now: Date, dueAt: Date): string {
  return kind === "silent" ? formatIst(dueAt) : relativeDue(now, dueAt);
}

type Subject = { subject: string; title: string; dueAt: Date };

/** The fixed template for one reminder (also the fallback when the model's wording fails). */
export function reminderTemplate(kind: ReminderKind, a: Subject, now: Date): string {
  const label = assignmentLabel(a);
  const dueText = dueTextFor(kind, now, a.dueAt);
  switch (kind) {
    case "silent":
      return `Did you see ${label}? Due ${dueText}.`;
    case "due_soon":
      return `${label} is due ${dueText}.`;
    case "blocked_checkin":
      return `Still stuck on ${label}?`;
    case "overdue":
      return `${label} was due ${dueText}.`;
  }
}

/** One line per reminder in a merged message. */
function bullet(kind: ReminderKind, a: Subject, now: Date): string {
  const label = assignmentLabel(a);
  const dueText = dueTextFor(kind, now, a.dueAt);
  switch (kind) {
    case "silent":
      return `• ${label}: did you see it? Due ${dueText}`;
    case "due_soon":
      return `• ${label}: due ${dueText}`;
    case "blocked_checkin":
      return `• ${label}: still stuck?`;
    case "overdue":
      return `• ${label}: was due ${dueText}`;
  }
}

/** Buttons always come from code, never from the model. */
export function reminderButtons(kind: ReminderKind, saId: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  switch (kind) {
    case "silent":
      kb.text("Got it", callbackData(CB.ack, saId)).text("I'm stuck", callbackData(CB.stuck, saId));
      break;
    case "due_soon":
      kb.text("Done", callbackData(CB.done, saId)).text("I'm stuck", callbackData(CB.stuck, saId));
      break;
    case "blocked_checkin":
      kb.text("Still stuck", callbackData(CB.stillStuck, saId)).text("Figured it out", callbackData(CB.figuredOut, saId));
      break;
    case "overdue":
      kb.text("Submit now", callbackData(CB.sendNow, saId))
        .text("Bringing it today", callbackData(CB.inClass, saId))
        .row()
        .text("I'm stuck", callbackData(CB.stuck, saId));
      break;
  }
  return kb.row().webApp("Open", appUrl(`/app/work/${saId}`));
}

export type ReminderItem = DueReminder & { row: ReminderRow };

/** Several reminders for one student in one tick → one message (template only) with [Open my work]. */
export function mergedReminder(items: ReminderItem[], now: Date): { text: string; reply_markup: InlineKeyboard } {
  const lines = items.map((i) => bullet(i.kind, i.row, now));
  return {
    text: `You have ${items.length} things to look at:\n${lines.join("\n")}`,
    reply_markup: new InlineKeyboard().webApp("Open my work", appUrl("/app")),
  };
}

/** One student's reminders as an OutboundPayload: single → its own text and buttons; several → merged. */
export function reminderPayload(
  items: ReminderItem[],
  now: Date,
  schoolId: string,
  singleText?: { text: string; wording: "llm" | "template" },
): OutboundPayload {
  const first = items[0];
  const reminder = {
    kinds: items.map((i) => i.kind),
    studentId: first.studentId,
    saIds: items.map((i) => i.saId),
    schoolId,
    classId: first.row.classId,
  };
  if (items.length === 1) {
    const text = singleText ?? { text: reminderTemplate(first.kind, first.row, now), wording: "template" as const };
    return {
      text: text.text,
      reply_markup: { inline_keyboard: reminderButtons(first.kind, first.saId).inline_keyboard },
      meta: { assignmentId: first.row.assignmentId, studentAssignmentId: first.saId, reminder: { ...reminder, wording: text.wording } },
    };
  }
  const merged = mergedReminder(items, now);
  return {
    text: merged.text,
    reply_markup: { inline_keyboard: merged.reply_markup.inline_keyboard },
    meta: { reminder: { ...reminder, wording: "template" } },
  };
}

/** One outbound message per student per tick: the key is built from that student's sorted reminder keys. */
export function reminderDedupeKey(studentId: string, keys: string[]): string {
  const hash = createHash("sha1").update([...keys].sort().join("|")).digest("hex").slice(0, 20);
  return `reminder:${studentId}:${hash}`;
}

// ───────────────────────────── Firing ─────────────────────────────

export type FiredItem = { studentName: string; kind: ReminderKind; classId: string; subject: string };
export type HeldItem = { studentName: string; classId: string; subject: string };

export type ReminderRun = {
  counts: Record<ReminderKind, number> & { skippedBlocked: number };
  fired: FiredItem[];
  held: HeldItem[];
  quietHours: boolean;
};

const OPEN_STATUSES: StudentAssignmentStatus[] = ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED"];

/** Linked, delivered, open student work on published assignments: everything a reminder could be about. */
async function loadReminderRows(schoolId?: string) {
  const sas = await prisma.studentAssignment.findMany({
    where: {
      deliveredAt: { not: null },
      status: { in: OPEN_STATUSES },
      assignment: { status: "PUBLISHED", ...(schoolId ? { schoolId } : {}) },
      student: { userId: { not: null } },
    },
    include: { assignment: true, student: { include: { user: true } } },
  });
  return sas.map((sa) => ({
    row: {
      saId: sa.id,
      studentId: sa.studentId,
      studentName: sa.student.name,
      linked: sa.student.userId !== null,
      classId: sa.assignment.classId,
      assignmentId: sa.assignmentId,
      assignmentStatus: sa.assignment.status,
      subject: sa.assignment.subject,
      title: sa.assignment.title,
      dueAt: sa.assignment.dueAt,
      version: sa.assignment.version,
      status: sa.status,
      deliveredAt: sa.deliveredAt,
      lastStudentActivityAt: sa.lastStudentActivityAt,
      blockedAt: sa.blockedAt,
    } satisfies ReminderRow,
    schoolId: sa.assignment.schoolId,
    user: sa.student.user,
  }));
}

class AlreadyFired extends Error {}

/** Wording hook for single reminders (the model in production; the template in tests). */
export type WordSingle = (item: ReminderItem, now: Date) => Promise<{ text: string; wording: "llm" | "template" }>;
export const templateWording: WordSingle = async (item, now) => ({ text: reminderTemplate(item.kind, item.row, now), wording: "template" });

export type RunOptions = {
  wordSingle?: WordSingle;
  settings?: ReminderSettings;
  /** Limit to one school (tests use a throwaway school so real students are never touched). */
  schoolId?: string;
};

export async function runReminders(now = new Date(), opts: RunOptions = {}): Promise<ReminderRun> {
  const s = opts.settings ?? reminderSettings();
  const wordSingle = opts.wordSingle ?? templateWording;
  const loaded = await loadReminderRows(opts.schoolId);
  const rows = loaded.map((l) => l.row);
  const bySa = new Map(loaded.map((l) => [l.row.saId, l]));
  const run: ReminderRun = {
    counts: { silent: 0, due_soon: 0, blocked_checkin: 0, overdue: 0, skippedBlocked: 0 },
    fired: [],
    held: heldBecauseBlocked(now, rows, s).map((r) => ({ studentName: r.studentName, classId: r.classId, subject: r.subject })),
    quietHours: inQuietHours(now, s),
  };
  run.counts.skippedBlocked = run.held.length;

  // Skip what already fired (cheap check before any wording work), then group per student.
  const due = computeDueReminders(now, rows, s);
  const fired = new Set(
    (await prisma.reminderFired.findMany({ where: { key: { in: due.map((d) => d.key) } }, select: { key: true } })).map((f) => f.key),
  );
  const perStudent = new Map<string, ReminderItem[]>();
  for (const d of due) {
    if (fired.has(d.key)) continue;
    const items = perStudent.get(d.studentId) ?? [];
    items.push({ ...d, row: bySa.get(d.saId)!.row });
    perStudent.set(d.studentId, items);
  }

  for (const items of perStudent.values()) {
    const first = bySa.get(items[0].saId)!;
    if (!first.user?.chatId) continue; // linked but never started the bot: nothing to send to
    const single = items.length === 1 ? await wordSingle(items[0], now) : undefined;
    const payload = reminderPayload(items, now, first.schoolId, single);

    try {
      await prisma.$transaction(async (tx) => {
        // ReminderFired first: the unique key is what makes reruns and restarts safe.
        const inserted = await tx.reminderFired.createMany({
          data: items.map((i) => ({ key: i.key, studentAssignmentId: i.saId, kind: i.kind })),
          skipDuplicates: true,
        });
        if (inserted.count !== items.length) throw new AlreadyFired(); // a parallel run got there first
        await enqueue(
          {
            chatId: first.user!.chatId!,
            recipientUserId: first.user!.id,
            toStudent: true,
            kind: "reminder",
            payload,
            dedupeKey: reminderDedupeKey(items[0].studentId, items.map((i) => i.key)),
          },
          tx,
        );
      });
    } catch (err) {
      if (err instanceof AlreadyFired) continue;
      throw err;
    }
    for (const i of items) {
      run.counts[i.kind]++;
      run.fired.push({ studentName: i.row.studentName, kind: i.kind, classId: i.row.classId, subject: i.row.subject });
    }
  }
  return run;
}
