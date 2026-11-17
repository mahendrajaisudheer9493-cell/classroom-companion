import type { StudentAssignmentStatus as Status } from "@prisma/client";

// Per-student assignment states (docs/DESIGN.md §4). The ONLY place that decides status changes.
//
//                  ┌──────── teacher: "checked in class" (from any open state) ────────┐
//                  │                                                                    ▼
// ASSIGNED ──► ACKNOWLEDGED ──► IN_PROGRESS ⇄ BLOCKED ──► SUBMITTED ──► COMPLETED
//   any open state can go straight to SUBMITTED              │   ▲
//                                                            ▼   │ resubmit
//                                                      NEEDS_REVISION

export type Actor = "student" | "teacher" | "system";

export type StudentEvent =
  | "ACKNOWLEDGE" // student taps [Got it]
  | "REPORT_PROGRESS" // student: "half done"
  | "REPORT_STUCK" // student: [I'm stuck] / "stuck on q5"
  | "SUBMIT" // student: photo, file, text, "bringing it to class"
  | "RESOLVE_DOUBT" // teacher: [Mark resolved]
  | "FEEDBACK_REVISION" // teacher: feedback asks for a redo
  | "FEEDBACK_COMPLETE" // teacher: feedback accepts
  | "CHECKED_IN_CLASS"; // teacher: "checked in class"

const OPEN: Status[] = ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "NEEDS_REVISION"];

type Rule = { actor: Actor; from: Status[]; to: Status | "same" };

// For each event: who may trigger it, from which states, and where it goes.
// "same" = the status doesn't change (e.g. acknowledging a change after already starting work).
export const RULES: Record<StudentEvent, Rule> = {
  // ASSIGNED → ACKNOWLEDGED; in any later state, acknowledging (e.g. a changed deadline) keeps the status.
  ACKNOWLEDGE: { actor: "student", from: ["ASSIGNED"], to: "ACKNOWLEDGED" },
  REPORT_PROGRESS: { actor: "student", from: ["ASSIGNED", "ACKNOWLEDGED", "BLOCKED"], to: "IN_PROGRESS" },
  REPORT_STUCK: { actor: "student", from: ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "NEEDS_REVISION"], to: "BLOCKED" },
  SUBMIT: { actor: "student", from: ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "NEEDS_REVISION"], to: "SUBMITTED" },
  RESOLVE_DOUBT: { actor: "teacher", from: ["BLOCKED"], to: "IN_PROGRESS" },
  FEEDBACK_REVISION: { actor: "teacher", from: ["SUBMITTED"], to: "NEEDS_REVISION" },
  FEEDBACK_COMPLETE: { actor: "teacher", from: ["SUBMITTED"], to: "COMPLETED" },
  CHECKED_IN_CLASS: { actor: "teacher", from: OPEN, to: "COMPLETED" },
};

// Events that keep the status when applied from a state outside `from` (instead of throwing).
const STATUS_PRESERVING: Partial<Record<StudentEvent, Status[]>> = {
  ACKNOWLEDGE: ["ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "NEEDS_REVISION", "COMPLETED"],
};

export class IllegalTransition extends Error {
  constructor(
    public from: Status,
    public event: StudentEvent,
    public actor: Actor,
  ) {
    super(`Illegal transition: ${event} by ${actor} from ${from}`);
    this.name = "IllegalTransition";
  }
}

/**
 * Validates a status change and returns the new status. Repeating an event whose target is the
 * current status (acknowledge twice, stuck twice, resubmit) is a no-op that returns the same status.
 * Anything else not allowed throws IllegalTransition, never applied silently.
 */
export function transition(sa: { status: Status }, event: StudentEvent, actor: Actor): Status {
  const rule = RULES[event];
  if (rule.actor !== actor) throw new IllegalTransition(sa.status, event, actor);
  if (rule.to !== "same" && sa.status === rule.to) return sa.status; // same-status repeat
  if (STATUS_PRESERVING[event]?.includes(sa.status)) return sa.status;
  if (!rule.from.includes(sa.status)) throw new IllegalTransition(sa.status, event, actor);
  return rule.to === "same" ? sa.status : rule.to;
}

export function isOpen(status: Status): boolean {
  return status !== "COMPLETED";
}
