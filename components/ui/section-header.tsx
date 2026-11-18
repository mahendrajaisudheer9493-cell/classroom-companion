import { cn } from "./cn";

/** Small uppercase hint text above a grouped list, like Telegram settings. */
export function SectionHeader({ title, action, className }: { title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-1.5 flex items-end justify-between gap-2 px-4", className)}>
      <h2 className="text-caption font-medium uppercase tracking-wide text-tg-section-header">{title}</h2>
      {action && <div className="text-caption">{action}</div>}
    </div>
  );
}
