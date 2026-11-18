"use client";

import { useEffect, useRef, useState } from "react";
import { haptic, waitForWebApp } from "@/app/app/_lib/telegram";

/**
 * Telegram's MainButton (the big bottom button) for a form's main action. Returns true when the
 * native button is shown, so the page can hide its own copy; outside Telegram it returns false and
 * the page renders a normal <Button>.
 */
export function useMainButton({ text, onClick, disabled, loading, visible = true }: {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  visible?: boolean;
}): boolean {
  const [native, setNative] = useState(false);
  const handler = useRef(onClick);
  useEffect(() => {
    handler.current = onClick;
  }, [onClick]);

  useEffect(() => {
    let cancelled = false;
    let mb: NonNullable<Awaited<ReturnType<typeof waitForWebApp>>>["MainButton"];
    const click = () => {
      haptic.tap();
      handler.current();
    };
    waitForWebApp().then((w) => {
      if (cancelled || !w?.initData || !w.MainButton) return;
      mb = w.MainButton;
      mb.onClick(click);
      setNative(true);
    });
    return () => {
      cancelled = true;
      mb?.offClick(click);
      mb?.hide();
    };
  }, []);

  useEffect(() => {
    if (!native) return;
    const mb = window.Telegram?.WebApp?.MainButton;
    if (!mb) return;
    mb.setText(text);
    if (!visible) return mb.hide();
    mb.show();
    if (disabled) mb.disable();
    else mb.enable();
    if (loading) mb.showProgress(false);
    else mb.hideProgress();
  }, [native, text, disabled, loading, visible]);

  return native;
}
