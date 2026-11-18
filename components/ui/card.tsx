import { cn } from "./cn";
import { TONE_CLASS, type Tone } from "./status";

/** A surface block (section background, rounded). `tone` adds a soft tint for notices. */
export function Card({ children, className, tone }: { children: React.ReactNode; className?: string; tone?: Tone }) {
  return <div className={cn("rounded-2xl p-4", tone ? cn("tinted", TONE_CLASS[tone]) : "bg-surface", className)}>{children}</div>;
}
