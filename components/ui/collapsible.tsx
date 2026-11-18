"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { haptic } from "@/app/app/_lib/telegram";
import { cn } from "./cn";
import { TONE_CLASS, type Tone } from "./status";

/** A card whose body opens and closes; the header shows a title and a count. */
export function Collapsible({ title, icon, tone, defaultOpen = false, children, className }: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("mb-6 overflow-hidden rounded-2xl bg-surface", tone && TONE_CLASS[tone], className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          haptic.select();
          setOpen((o) => !o);
        }}
        className={cn("flex min-h-12 w-full items-center gap-2.5 px-4 py-3 text-left", tone && "tinted")}
      >
        {icon}
        <span className="flex-1 text-body font-semibold">{title}</span>
        <ChevronDown aria-hidden size={18} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
