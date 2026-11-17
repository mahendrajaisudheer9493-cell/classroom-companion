import type { TriageFlagName } from "@/app/app/_lib/types";

// Status chips and small tags, shared by every screen.

const STATUS: Record<string, { label: string; className: string }> = {
  ASSIGNED: { label: "Not seen", className: "bg-tg-hint/15 text-tg-hint" },
  ACKNOWLEDGED: { label: "Got it", className: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  IN_PROGRESS: { label: "In progress", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  BLOCKED: { label: "Stuck", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  SUBMITTED: { label: "Submitted", className: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  NEEDS_REVISION: { label: "Needs revision", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  COMPLETED: { label: "Completed", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

export const statusLabel = (status: string) => STATUS[status]?.label ?? status;

export function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, className: "bg-tg-hint/15 text-tg-hint" };
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

const FLAG: Record<TriageFlagName, string> = {
  hasnt_seen_change: "hasn't seen the change",
  not_on_telegram: "not on Telegram yet",
  unanswered_question: "unanswered question",
  overdue: "overdue",
};

export function Flags({ flags }: { flags: TriageFlagName[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className="rounded border border-tg-hint/30 px-1.5 text-[11px] text-tg-hint">
          {FLAG[f]}
        </span>
      ))}
    </span>
  );
}

/** "just now", "5 min ago", "2 h ago", "3 d ago" */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "no activity";
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function Banner({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" | "success" }) {
  const color = tone === "error" ? "text-tg-destructive" : tone === "success" ? "text-emerald-700 dark:text-emerald-400" : "";
  return <p className={`mb-4 rounded-lg bg-tg-secondary-bg px-4 py-2.5 text-sm ${color}`}>{children}</p>;
}
