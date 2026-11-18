"use client";

import { CloudOff, Lock, ShieldX, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button as BaseButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { List } from "@/components/ui/list";
import { SkeletonList } from "@/components/ui/skeleton";

// Compatibility layer: the screens' original building blocks, now drawn with components/ui
// (inset grouped lists, tonal buttons, skeletons, empty states).

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <List title={title}>{children}</List>;
}

/** A free-form row inside a Section (separators like ListRow). */
export function Row({ children }: { children: ReactNode }) {
  return (
    <div className="list-row flex">
      <div className="list-row-body flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-3">{children}</div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  return (
    <BaseButton size="sm" variant={variant === "danger" ? "destructive" : variant} onClick={onClick} disabled={disabled}>
      {children}
    </BaseButton>
  );
}

export function Loading() {
  return (
    <div className="pt-2">
      <SkeletonList rows={3} />
      <SkeletonList rows={2} />
    </div>
  );
}

/** Shown when the API says we're not linked, or we're outside Telegram, or something failed. */
export function Notice({ error, message }: { error: string; message: string }) {
  if (error === "not_linked") {
    return (
      <EmptyState
        icon={Users}
        tone="accent"
        title="You haven't joined a class yet"
        detail={
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-left">
            <li>Ask your teacher for your class link.</li>
            <li>Open it in Telegram. It starts a chat with the Classroom Companion bot.</li>
            <li>Confirm your class and tap your name.</li>
            <li>Come back here with the bot&apos;s Open button.</li>
          </ol>
        }
      />
    );
  }
  if (error === "unauthorized") {
    return (
      <EmptyState
        icon={Lock}
        tone="accent"
        title="Open this in Telegram"
        detail="Classroom Companion runs inside Telegram. Open the Classroom Companion bot and tap Open."
      />
    );
  }
  if (error === "forbidden") return <EmptyState icon={ShieldX} tone="danger" title="Not allowed" detail={message} />;
  return <EmptyState icon={CloudOff} tone="neutral" title="Something went wrong" detail={message} />;
}
