import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-lg bg-[var(--color-separator)] [animation:skeleton-pulse_1.4s_ease-in-out_infinite]", className)} />;
}

/** Loading placeholder shaped like a grouped list. */
export function SkeletonList({ rows = 4, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="mb-6">
      {title && <Skeleton className="mb-2 ml-4 h-3 w-24" />}
      <div className="overflow-hidden rounded-2xl bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
