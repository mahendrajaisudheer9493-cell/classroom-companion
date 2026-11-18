"use client";

import Link from "next/link";
import { haptic } from "@/app/app/_lib/telegram";
import { cn } from "./cn";
import type { StatusMeta } from "./status";
import { TONE_CLASS } from "./status";

/** Big number + label, colour-coded by meaning; tinted when non-zero, quiet at zero. */
export function CountTile({ count, meta, href, onClick }: { count: number; meta: StatusMeta; href?: string; onClick?: () => void }) {
  const Icon = meta.icon;
  const active = count > 0;
  const inner = (
    <>
      <span className="flex items-center justify-between">
        <span className={cn("text-large font-bold tabular-nums", active ? "text-tone" : "text-tg-hint")}>{count}</span>
        <Icon aria-hidden size={18} className={active ? "text-tone" : "text-tg-hint opacity-60"} strokeWidth={2.2} />
      </span>
      <span className={cn("text-caption font-medium", active ? "text-tg-text" : "text-tg-hint")}>{meta.label}</span>
    </>
  );
  const cls = cn(
    "flex min-h-[76px] flex-col justify-between rounded-2xl p-3 text-left active:opacity-70",
    TONE_CLASS[meta.tone],
    active ? "tinted" : "bg-surface",
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={() => haptic.tap()} aria-label={`${count} ${meta.label}`}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => (haptic.tap(), onClick?.())} aria-label={`${count} ${meta.label}`}>
      {inner}
    </button>
  );
}
