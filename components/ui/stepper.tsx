import { Check } from "lucide-react";
import { cn } from "./cn";
import { TONE_CLASS, type Tone } from "./status";

// Assigned → Seen → Working → Submitted → Reviewed, with the current step highlighted.

export const STEPS = ["Assigned", "Seen", "Working", "Submitted", "Reviewed"] as const;

/** Which step a student-assignment status is at, and the tone of the current step. */
export function stepFor(status: string): { index: number; tone: Tone; note?: string } {
  switch (status) {
    case "ASSIGNED":
      return { index: 0, tone: "assigned" };
    case "ACKNOWLEDGED":
      return { index: 1, tone: "ack" };
    case "IN_PROGRESS":
      return { index: 2, tone: "progress" };
    case "BLOCKED":
      return { index: 2, tone: "stuck", note: "Stuck" };
    case "SUBMITTED":
      return { index: 3, tone: "submitted" };
    case "NEEDS_REVISION":
      return { index: 4, tone: "revision", note: "Needs revision" };
    case "COMPLETED":
      return { index: 4, tone: "completed", note: "Completed" };
    default:
      return { index: 0, tone: "neutral" };
  }
}

export function Stepper({ status, className }: { status: string; className?: string }) {
  const { index, tone, note } = stepFor(status);
  return (
    <ol className={cn("flex items-start", TONE_CLASS[tone], className)} aria-label={`Progress: ${note ?? STEPS[index]}`}>
      {STEPS.map((label, i) => {
        const done = i < index;
        const current = i === index;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span aria-hidden className={cn("absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2", i <= index ? "bg-tone" : "bg-[var(--color-separator)]")} />}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold",
                done && "bg-tone text-white",
                current && "bg-tone text-white ring-4 ring-[color-mix(in_srgb,var(--tone)_22%,transparent)]",
                !done && !current && "bg-surface text-tg-hint ring-1 ring-[var(--color-separator)]",
              )}
              aria-current={current ? "step" : undefined}
            >
              {done ? <Check size={14} strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cn("mt-1.5 text-[12px] leading-4", current ? "text-tone font-semibold" : done ? "text-tg-text" : "text-tg-hint")}>
              {current && note ? note : label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
