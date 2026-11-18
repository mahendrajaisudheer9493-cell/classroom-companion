import {
  BellDot,
  Check,
  CircleCheckBig,
  CircleDashed,
  CircleExclamationPoint,
  Clock,
  EyeOff,
  Hourglass,
  Inbox,
  MessageCircleQuestionMark,
  RotateCcw,
  Send,
  UserX,
  type LucideIcon,
} from "lucide-react";

// One meaning per colour, used everywhere (chips, tiles, list accents).
// Stuck red · Silent amber · Overdue rose · To review blue · In progress indigo · Acknowledged teal ·
// Assigned gray · Submitted blue · Needs revision orange · Completed green.

export type Tone =
  | "stuck" | "silent" | "overdue" | "review" | "progress" | "ack" | "assigned" | "submitted" | "revision" | "completed"
  | "accent" | "danger" | "neutral";

/** Tailwind utility that sets --tone (see globals.css). Listed literally so Tailwind generates them. */
export const TONE_CLASS: Record<Tone, string> = {
  stuck: "tone-stuck",
  silent: "tone-silent",
  overdue: "tone-overdue",
  review: "tone-review",
  progress: "tone-progress",
  ack: "tone-ack",
  assigned: "tone-assigned",
  submitted: "tone-submitted",
  revision: "tone-revision",
  completed: "tone-completed",
  accent: "tone-accent",
  danger: "tone-danger",
  neutral: "tone-neutral",
};

export type StatusMeta = { label: string; tone: Tone; icon: LucideIcon };

/** Per-student status (StudentAssignment.status). */
export const STUDENT_STATUS: Record<string, StatusMeta> = {
  ASSIGNED: { label: "Not seen", tone: "assigned", icon: CircleDashed },
  ACKNOWLEDGED: { label: "Got it", tone: "ack", icon: Check },
  IN_PROGRESS: { label: "In progress", tone: "progress", icon: Hourglass },
  BLOCKED: { label: "Stuck", tone: "stuck", icon: CircleExclamationPoint },
  SUBMITTED: { label: "Submitted", tone: "submitted", icon: Send },
  NEEDS_REVISION: { label: "Needs revision", tone: "revision", icon: RotateCcw },
  COMPLETED: { label: "Completed", tone: "completed", icon: CircleCheckBig },
};

/** Triage groups (board sections, count tiles). */
export const TRIAGE_GROUP: Record<"stuck" | "silent" | "overdue" | "toReview", StatusMeta> = {
  stuck: { label: "Stuck", tone: "stuck", icon: CircleExclamationPoint },
  silent: { label: "Silent", tone: "silent", icon: EyeOff },
  overdue: { label: "Overdue", tone: "overdue", icon: Clock },
  toReview: { label: "To review", tone: "review", icon: Inbox },
};

/** Triage flags shown as small tags. */
export const FLAG: Record<string, StatusMeta> = {
  hasnt_seen_change: { label: "hasn't seen the change", tone: "silent", icon: BellDot },
  not_on_telegram: { label: "not on Telegram yet", tone: "assigned", icon: UserX },
  unanswered_question: { label: "unanswered question", tone: "stuck", icon: MessageCircleQuestionMark },
  overdue: { label: "overdue", tone: "overdue", icon: Clock },
};

export const statusMeta = (status: string): StatusMeta => STUDENT_STATUS[status] ?? { label: status, tone: "neutral", icon: CircleDashed };
