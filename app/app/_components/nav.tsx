"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { waitForWebApp } from "@/app/app/_lib/telegram";

type BackButtonApi = { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };

/**
 * Telegram's native BackButton (top-left in the Mini App header). Outside Telegram, a plain link.
 * Put it at the top of every screen except the home screen.
 */
export function BackNav({ fallbackHref = "/app", label = "Back" }: { fallbackHref?: string; label?: string }) {
  const router = useRouter();
  const [native, setNative] = useState(false);

  useEffect(() => {
    let button: BackButtonApi | undefined;
    const goBack = () => (window.history.length > 1 ? router.back() : router.push(fallbackHref));
    waitForWebApp().then((webApp) => {
      const b = (webApp as unknown as { initData?: string; BackButton?: BackButtonApi } | null);
      if (!b?.initData || !b.BackButton) return;
      button = b.BackButton;
      button.onClick(goBack);
      button.show();
      setNative(true);
    });
    return () => {
      button?.offClick(goBack);
      button?.hide();
    };
  }, [router, fallbackHref]);

  if (native) return null;
  return (
    <Link href={fallbackHref} className="mb-3 inline-block py-1 text-sm text-tg-link">
      ‹ {label}
    </Link>
  );
}
