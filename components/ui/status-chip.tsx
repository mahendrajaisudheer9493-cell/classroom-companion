import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { FLAG, statusMeta, TONE_CLASS, type Tone } from "./status";

// Soft tinted background + strong text + icon; readable in light and dark (tones in globals.css).

export function Chip({ tone, icon: Icon, children, size = "md" }: { tone: Tone; icon?: LucideIcon; children: React.ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "tinted inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        size === "md" ? "px-2.5 py-1 text-caption" : "px-2 py-0.5 text-[12px] leading-4",
        TONE_CLASS[tone],
      )}
    >
      {Icon && <Icon aria-hidden size={size === "md" ? 14 : 12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

/** A student-assignment status: "Stuck", "Got it", "Completed", … */
export function StatusChip({ status, size }: { status: string; size?: "sm" | "md" }) {
  const m = statusMeta(status);
  return (
    <Chip tone={m.tone} icon={m.icon} size={size}>
      {m.label}
    </Chip>
  );
}

/** Triage flags ("hasn't seen the change", "not on Telegram yet", …) as small tags. */
export function FlagTags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => {
        const m = FLAG[f] ?? { label: f, tone: "neutral" as const, icon: undefined };
        return (
          <Chip key={f} tone={m.tone} icon={m.icon} size="sm">
            {m.label}
          </Chip>
        );
      })}
    </span>
  );
}
