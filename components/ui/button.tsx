"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { haptic } from "@/app/app/_lib/telegram";
import { cn } from "./cn";

// primary = Telegram button colour · secondary = tonal (soft tint of the button colour) ·
// destructive = tonal red · plain = text only.

export type ButtonVariant = "primary" | "secondary" | "destructive" | "plain";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-tg-button text-tg-button-text",
  secondary: "tinted tone-accent",
  destructive: "tinted tone-danger",
  plain: "text-tg-link",
};

type Props = {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
};

export function Button({ children, variant = "primary", size = "md", icon: Icon, loading, disabled, block, href, onClick, className, type = "button" }: Props) {
  const cls = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-opacity active:opacity-70 disabled:opacity-45",
    size === "md" ? "min-h-11 px-4 text-body" : "min-h-9 px-3 text-caption",
    block && "w-full",
    VARIANT[variant],
    className,
  );
  const content = (
    <>
      {loading ? <LoaderCircle aria-hidden size={16} className="animate-spin" /> : Icon && <Icon aria-hidden size={size === "md" ? 18 : 15} />}
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
