"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { haptic } from "@/app/app/_lib/telegram";
import { Avatar } from "./avatar";
import { cn } from "./cn";
import { SectionHeader } from "./section-header";

// Inset grouped list (Telegram settings style): a header, then rows on one rounded surface with
// separators inset past the leading avatar/icon.

export function List({ title, action, footer, children, className }: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-6", className)}>
      {title && <SectionHeader title={title} action={action} />}
      <div className="overflow-hidden rounded-2xl bg-surface">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-caption text-tg-hint">{footer}</p>}
    </section>
  );
}

type RowProps = {
  /** Avatar initials from this name (or pass `leading` for an icon). */
  avatar?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-hand detail: text, a chip, a count. */
  detail?: React.ReactNode;
  /** Extra content under the subtitle (tags, buttons). */
  children?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** Shown automatically for links. */
  chevron?: boolean;
  className?: string;
};

export function ListRow({ avatar, leading, title, subtitle, detail, children, href, onClick, chevron, className }: RowProps) {
  const interactive = !!(href || onClick);
  const showChevron = chevron ?? !!href;
  const body = (
    <>
      {(avatar || leading) && <div className="flex shrink-0 items-center py-2.5 pl-4">{avatar ? <Avatar name={avatar} /> : leading}</div>}
      <div className={cn("list-row-body flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 pr-3", avatar || leading ? "pl-3" : "pl-4")}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-medium text-tg-text">{title}</div>
          {subtitle && <div className="text-caption text-tg-subtitle">{subtitle}</div>}
          {children && <div className="mt-1.5">{children}</div>}
        </div>
        {detail && <div className="flex shrink-0 items-center gap-2 text-caption text-tg-hint">{detail}</div>}
        {showChevron && <ChevronRight aria-hidden size={18} className="shrink-0 text-tg-hint opacity-60" />}
      </div>
    </>
  );
  const cls = cn("list-row flex w-full items-stretch text-left", interactive && "active:bg-[var(--color-separator)]", className);
  if (href) {
    return (
      <Link href={href} className={cls} onClick={() => haptic.tap()}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => {
          haptic.tap();
          onClick();
        }}
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
