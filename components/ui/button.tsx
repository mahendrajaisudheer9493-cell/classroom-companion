"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { haptic } from "@/app/app/_lib/telegram";
import { cn } from "./cn";
import { TONE_CLASS, type Tone } from "./status";

// primary = Telegram button colour · secondary = tonal (soft tint of the button colour) ·
// destructive = tonal red · plain = text only.

export type ButtonVariant = "primary" | "secondary" | "destructive" | "plain" | "solid" | "tonal";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-tg-button text-tg-button-text",
  secondary: "tinted tone-accent",
  destructive: "tinted tone-danger",
  plain: "text-tg-link",
  solid: "bg-tone text-white", // with `tone`, e.g. green Completed
  tonal: "tinted", // with `tone`, e.g. small action pills
};

type Props = {
  children: React.ReactNode;
  variant?: ButtonVariant;
  /** lg = big action, md = default, sm = compact, pill = small rounded action. */
  size?: "lg" | "md" | "sm" | "pill";
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  /** Colour for the solid/tonal variants (status tones). */
  tone?: Tone;
};

export function Button({ children, variant = "primary", size = "md", icon: Icon, loading, disabled, block, href, onClick, className, type = "button", tone }: Props) {
  const cls = cn(
    "inline-flex items-center justify-center gap-1.5 font-semibold transition-opacity active:opacity-70 disabled:opacity-45",
    size === "lg" ? "min-h-[52px] rounded-2xl px-5 text-headline" : size === "md" ? "min-h-11 rounded-xl px-4 text-body" : size === "sm" ? "min-h-9 rounded-xl px-3 text-caption" : "min-h-8 rounded-full px-3 text-caption",
    tone && TONE_CLASS[tone],
    block && "w-full",
    VARIANT[variant],
    className,
  );
  const content = (
    <>
      {loading ? <LoaderCircle aria-hidden size={16} className="animate-spin" /> : Icon && <Icon aria-hidden size={size === "lg" || size === "md" ? 18 : 15} />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={() => haptic.tap()}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cls}
      onClick={() => {
        haptic.tap();
        onClick?.();
      }}
    >
      {content}
    </button>
  );
}
