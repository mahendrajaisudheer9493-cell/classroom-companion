import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { TONE_CLASS, type Tone } from "./status";

/** Icon + one line (+ optional detail and action). */
export function EmptyState({ icon: Icon, title, detail, action, tone = "neutral", className }: {
  icon: LucideIcon;
  title: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <span className={cn("tinted mb-3 flex h-14 w-14 items-center justify-center rounded-full", TONE_CLASS[tone])}>
        <Icon aria-hidden size={26} />
      </span>
      <p className="text-headline font-semibold text-tg-text">{title}</p>
      {detail && <div className="mt-1 max-w-xs text-body text-tg-hint">{detail}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
