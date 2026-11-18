import { cn } from "./cn";
import { statusMeta, TONE_CLASS } from "./status";

// Stacked bar of student statuses (one colour per status) with a legend of counts.

const ORDER = ["BLOCKED", "ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION", "COMPLETED"];

export function StatusBar({ counts, className }: { counts: Record<string, number>; className?: string }) {
  const entries = ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => ({ status: s, n: counts[s], meta: statusMeta(s) }));
  const total = entries.reduce((a, e) => a + e.n, 0);
  if (total === 0) return null;
  return (
    <div className={className}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-separator)]" role="img" aria-label={entries.map((e) => `${e.n} ${e.meta.label}`).join(", ")}>
        {entries.map((e) => (
          <div key={e.status} className={cn("bg-tone h-full border-r-2 border-[var(--color-surface)] last:border-r-0", TONE_CLASS[e.meta.tone])} style={{ width: `${(e.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
        {entries.map((e) => (
          <li key={e.status} className={cn("flex items-center gap-1.5 text-caption", TONE_CLASS[e.meta.tone])}>
            <span className="bg-tone h-2.5 w-2.5 rounded-full" aria-hidden />
            <span className="text-tg-text">
              <b className="font-semibold tabular-nums">{e.n}</b> {e.meta.label.toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
