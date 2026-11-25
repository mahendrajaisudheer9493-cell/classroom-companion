// Client-side helpers for the Telegram Mini App. Identity is NEVER decided here: we only forward
// Telegram's signed initData to our API, which validates it on every request.

// SDK methods return the object itself (for chaining) and may be missing on old Telegram clients,
// so every method is optional and typed as returning `unknown`. Call them only through tgSafe().
export type BottomButton = {
  setText?(text: string): unknown;
  show?(): unknown;
  hide?(): unknown;
  enable?(): unknown;
  disable?(): unknown;
  showProgress?(leaveActive?: boolean): unknown;
  hideProgress?(): unknown;
  onClick?(cb: () => void): unknown;
  offClick?(cb: () => void): unknown;
};

export type TelegramWebApp = {
  initData: string;
  version: string;
  platform?: string;
  colorScheme?: "light" | "dark";
  ready?(): unknown;
  expand?(): unknown;
  showConfirm?(message: string, callback: (ok: boolean) => void): void;
  openTelegramLink?(url: string): void;
  isVersionAtLeast?(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(event: string, cb: () => void): void;
  offEvent?(event: string, cb: () => void): void;
  MainButton?: BottomButton;
  BackButton?: { show?(): unknown; hide?(): unknown; onClick?(cb: () => void): unknown; offClick?(cb: () => void): unknown };
  HapticFeedback?: {
    impactOccurred?(style: "light" | "medium" | "heavy" | "rigid" | "soft"): unknown;
    notificationOccurred?(type: "error" | "success" | "warning"): unknown;
    selectionChanged?(): unknown;
  };
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

// ───────────────────────────── Safe SDK layer ─────────────────────────────
// Rule: never call the Telegram SDK during render, check the client version and that the method
// exists, and wrap every call so a failure (old client, unsupported option) can't crash a page.

/** Runs one SDK call. Any throw is logged (console.warn) and swallowed; returns undefined then. */
export function tgSafe<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    console.warn(`[telegram] ${label} failed`, err);
    return undefined;
  }
}

/** The WebApp object right now (no waiting); undefined during server render or outside Telegram. */
export const webAppNow = (): TelegramWebApp | undefined => (typeof window === "undefined" ? undefined : window.Telegram?.WebApp);

/** True inside a real Telegram session (signed initData present). */
export const inTelegram = (w: TelegramWebApp | undefined | null): w is TelegramWebApp => !!w?.initData;

/** isVersionAtLeast, safely (false when unknown). */
export const tgSupports = (w: TelegramWebApp | undefined | null, version: string): boolean =>
  tgSafe("isVersionAtLeast", () => w?.isVersionAtLeast?.(version) === true) ?? false;

/** Native Telegram confirm dialog (6.2+), falling back to window.confirm. Never throws. */
export async function confirmDialog(message: string): Promise<boolean> {
  const webApp = await waitForWebApp(0);
  if (inTelegram(webApp) && typeof webApp.showConfirm === "function" && tgSupports(webApp, "6.2")) {
    const answer = await new Promise<boolean | null>((resolve) => {
      const started = tgSafe("showConfirm", () => {
        webApp.showConfirm!(message, (ok) => resolve(!!ok));
        return true;
      });
      if (!started) resolve(null); // the call failed: use the browser dialog below
    });
    if (answer !== null) return answer;
  }
  return tgSafe("window.confirm", () => window.confirm(message)) ?? false;
}

/** Opens Telegram's share sheet (inside Telegram), so a teacher can post the class link to the class group. */
export async function shareInTelegram(url: string, text: string): Promise<boolean> {
  const webApp = await waitForWebApp(0);
  if (!inTelegram(webApp) || typeof webApp.openTelegramLink !== "function") return false;
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return tgSafe("openTelegramLink", () => (webApp.openTelegramLink!(link), true)) ?? false;
}

// ───────────────────────────── Telegram feel ─────────────────────────────

function hapticCall(label: string, fn: (h: NonNullable<TelegramWebApp["HapticFeedback"]>) => unknown) {
  const w = webAppNow();
  if (!inTelegram(w) || !w.HapticFeedback || !tgSupports(w, "6.1")) return;
  tgSafe(label, () => fn(w.HapticFeedback!));
}

/** Haptics (no-ops outside Telegram, on clients older than 6.1, and if the call fails). */
export const haptic = {
  tap: () => hapticCall("haptic.tap", (h) => h.impactOccurred?.("light")),
  select: () => hapticCall("haptic.select", (h) => h.selectionChanged?.()),
  success: () => hapticCall("haptic.success", (h) => h.notificationOccurred?.("success")),
  error: () => hapticCall("haptic.error", (h) => h.notificationOccurred?.("error")),
};

/** data-theme from Telegram's colorScheme; header and background colours match the page (secondary bg). */
export function syncTheme(webApp: TelegramWebApp) {
  document.documentElement.dataset.theme = webApp.colorScheme === "dark" ? "dark" : "light";
  if (tgSupports(webApp, "6.1")) {
    tgSafe("setHeaderColor", () => webApp.setHeaderColor?.("secondary_bg_color"));
    tgSafe("setBackgroundColor", () => webApp.setBackgroundColor?.("secondary_bg_color"));
  }
}
