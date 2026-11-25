"use client";

import { useEffect } from "react";
import { reportClientError } from "@/app/app/_lib/client-error";
import { inTelegram, syncTheme, tgSafe, waitForWebApp } from "@/app/app/_lib/telegram";

/**
 * ready() + expand(), and keeps the theme in sync: data-theme from Telegram's colorScheme (light/dark
 * status colours), header and background colours matching the page. Outside Telegram the system
 * light/dark setting applies (see globals.css). Also reports uncaught client errors to the server.
 * Every SDK call is guarded: a failure here must never break the app.
 */
export function TelegramInit() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.error ?? e.message, { source: "window.error" });
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason, { source: "unhandledrejection" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    let cancelled = false;
    let off = () => {};
    waitForWebApp().then((webApp) => {
      if (cancelled || !inTelegram(webApp)) return;
      tgSafe("ready", () => webApp.ready?.());
      tgSafe("expand", () => webApp.expand?.());
      tgSafe("syncTheme", () => syncTheme(webApp));
      const onTheme = () => tgSafe("syncTheme", () => syncTheme(webApp));
      if (typeof webApp.onEvent === "function") {
        tgSafe("onEvent(themeChanged)", () => webApp.onEvent!("themeChanged", onTheme));
        off = () => tgSafe("offEvent(themeChanged)", () => webApp.offEvent?.("themeChanged", onTheme));
      }
    });
    return () => {
      cancelled = true;
      off();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
