"use client";

import { useEffect } from "react";
import { waitForWebApp } from "@/app/app/_lib/telegram";

/** Tells Telegram the Mini App is ready and expands it to full height. */
export function TelegramInit() {
  useEffect(() => {
    waitForWebApp().then((webApp) => {
      webApp?.ready();
      webApp?.expand();
    });
  }, []);
  return null;
}
