"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { inTelegram, tgSafe, tgSupports, waitForWebApp, type TelegramWebApp } from "@/app/app/_lib/telegram";


/**
 * Telegram's native BackButton (top-left in the Mini App header). Outside Telegram, a plain link.
 * Put it at the top of every screen except the home screen.
 */
export function BackNav({ fallbackHref = "/app", label = "Back" }: { fallbackHref?: string; label?: string }) {
  const router = useRouter();
  const [native, setNative] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let button: NonNullable<TelegramWebApp["BackButton"]> | undefined;
    const goBack = () => (window.history.length > 1 ? router.back() : router.push(fallbackHref));
    waitForWebApp().then((webApp) => {
      if (cancelled || !inTelegram(webApp) || !tgSupports(webApp, "6.1")) return;
      const b = webApp.BackButton;
      if (!b || typeof b.onClick !== "function" || typeof b.show !== "function") return;
      const attached = tgSafe("BackButton.show", () => {
        b.onClick!(goBack);
        b.show!();
        return true;
      });
      if (attached) {
        button = b;
        setNative(true);
      }
    });
    return () => {
      cancelled = true;
      if (!button) return;
      const b = button;
      tgSafe("BackButton.offClick", () => b.offClick?.(goBack));
      tgSafe("BackButton.hide", () => b.hide?.());
    };
  }, [router, fallbackHref]);

  if (native) return null;
  return (
    <Link href={fallbackHref} className="-ml-1 mb-3 inline-flex items-center gap-0.5 py-1 text-body text-tg-link">
      <ChevronLeft aria-hidden size={20} />
      {label}
    </Link>
  );
}
