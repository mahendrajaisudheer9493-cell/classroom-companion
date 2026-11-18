"use client";

import { haptic } from "@/app/app/_lib/telegram";
import { cn } from "./cn";

/** iOS-style segmented control. */
export function SegmentedTabs<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("mb-5 flex rounded-xl bg-[var(--color-separator)] p-0.5", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              if (!selected) haptic.select();
              onChange(o.value);
            }}
            className={cn(
              "min-h-8 flex-1 rounded-[10px] px-2 text-caption font-semibold transition-colors",
              selected ? "bg-surface text-tg-text shadow-sm" : "text-tg-hint",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="ml-1 tabular-nums opacity-70">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
