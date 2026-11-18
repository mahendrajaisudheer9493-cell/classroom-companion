"use client";

import { useEffect } from "react";
import { syncTheme, waitForWebApp } from "@/app/app/_lib/telegram";

/**
 * ready() + expand(), and keeps the theme in sync: data-theme from Telegram's colorScheme (light/dark
 * status colours), header and background colours matching the page. Outside Telegram the system
 * light/dark setting applies (see globals.css).
 */
export function TelegramInit() {
  useEffect(() => {
    let cleanup = () => {};
    waitForWebApp().then((webApp) => {
      if (!webApp?.initData) return;
      webApp.ready();
      webApp.expand();
      syncTheme(webApp);
      const onTheme = () => syncTheme(webApp);
      webApp.onEvent?.("themeChanged", onTheme);
      cleanup = () => webApp.offEvent?.("themeChanged", onTheme);
    });
    return () => cleanup();
  }, []);
  return null;
}
