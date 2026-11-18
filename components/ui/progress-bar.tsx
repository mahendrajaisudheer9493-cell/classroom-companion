import { cn } from "./cn";
import { TONE_CLASS, type Tone } from "./status";

/** Thin bar with an optional label row, e.g. "Linked 4 / 6". */
export function ProgressBar({ value, max, tone = "accent", label, className }: { value: number; max: number; tone?: Tone; label?: React.ReactNode; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn(TONE_CLASS[tone], className)}>
      {label && <div className="mb-1 flex justify-between text-caption text-tg-hint">{label}</div>}
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-1.5 overflow-hidden rounded-full bg-[var(--color-separator)]">
        <div className="bg-tone h-full rounded-full transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
