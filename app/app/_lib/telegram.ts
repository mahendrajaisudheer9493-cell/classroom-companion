// Client-side helpers for the Telegram Mini App. Identity is NEVER decided here: we only forward
// Telegram's signed initData to our API, which validates it on every request.

type TelegramWebApp = {
  initData: string;
  version: string;
  ready(): void;
  expand(): void;
  showConfirm?(message: string, callback: (ok: boolean) => void): void;
  openTelegramLink?(url: string): void;
  isVersionAtLeast?(version: string): boolean;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Resolves once telegram-web-app.js has loaded (or null after `timeoutMs`, e.g. in a normal browser). */
export function waitForWebApp(timeoutMs = 3000): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const webApp = window.Telegram?.WebApp;
      if (webApp) return resolve(webApp);
      if (Date.now() - started > timeoutMs) return resolve(null);
      setTimeout(check, 50);
    };
    check();
  });
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; message: string };

/** fetch() for our API: adds "Authorization: tma <initData>" when running inside Telegram. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const webApp = await waitForWebApp();
  const headers = new Headers(init.headers);
  if (webApp?.initData) headers.set("Authorization", `tma ${webApp.initData}`);
  if (init.body) headers.set("Content-Type", "application/json");

  try {
    const res = await fetch(path, { ...init, headers });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: body as T };
    return {
      ok: false,
      status: res.status,
      error: body.error ?? "error",
      message: body.message ?? "Something went wrong. Please try again.",
    };
  } catch {
    return { ok: false, status: 0, error: "network", message: "No connection. Please try again." };
  }
}

/** Native Telegram confirm dialog, falling back to window.confirm outside Telegram. */
export async function confirmDialog(message: string): Promise<boolean> {
  const webApp = await waitForWebApp(0);
  if (webApp?.initData && webApp.showConfirm && webApp.isVersionAtLeast?.("6.2")) {
    return new Promise((resolve) => webApp.showConfirm!(message, resolve));
  }
  return window.confirm(message);
}

/** Opens Telegram's share sheet (inside Telegram), so a teacher can post the class link to the class group. */
export async function shareInTelegram(url: string, text: string): Promise<boolean> {
  const webApp = await waitForWebApp(0);
  if (!webApp?.initData || !webApp.openTelegramLink) return false;
  webApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  return true;
}
