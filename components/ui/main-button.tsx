"use client";

import { useEffect, useRef, useState } from "react";
import { attachMainButton, type MainButtonController } from "@/app/app/_lib/main-button";
import { haptic, waitForWebApp } from "@/app/app/_lib/telegram";

/**
 * Telegram's MainButton (the big bottom button) for a form's main action. Returns true while the
 * native button is in use, so the page hides its own copy. Outside Telegram, on old clients, or if
 * any SDK call fails, it returns false and the page shows its normal in-page button.
 * Never calls the SDK during render; effects only ever return cleanup functions.
 */
export function useMainButton({ text, onClick, disabled, loading, visible = true }: {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  visible?: boolean;
}): boolean {
  const [native, setNative] = useState(false);
  const controller = useRef<MainButtonController | null>(null);
  const handler = useRef(onClick);
  useEffect(() => {
    handler.current = onClick;
  }, [onClick]);

  // Attach once.
  useEffect(() => {
    let cancelled = false;
    const click = () => {
      haptic.tap();
      try {
        handler.current();
      } catch (err) {
        console.error("[telegram] MainButton action failed", err);
      }
    };
    waitForWebApp().then((webApp) => {
      if (cancelled) return;
      controller.current = attachMainButton(webApp, click);
      setNative(controller.current !== null);
    });
    return () => {
      cancelled = true;
      controller.current?.destroy();
      controller.current = null;
    };
  }, []);

  // Keep it in sync; fall back to the in-page button if an update fails.
  useEffect(() => {
    if (!native || !controller.current) return;
    if (!controller.current.update({ text, disabled, loading, visible })) {
      controller.current.destroy();
      controller.current = null;
      setNative(false);
    }
  }, [native, text, disabled, loading, visible]);

  return native;
}
