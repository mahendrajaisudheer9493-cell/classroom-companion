import { inTelegram, tgSafe, tgSupports, type BottomButton, type TelegramWebApp } from "@/app/app/_lib/telegram";

// Telegram's MainButton, driven safely. Plain functions (no React) so they can be unit-tested.
// Any failure returns false, and the page then shows its own in-page button instead.

export type MainButtonState = { text: string; disabled?: boolean; loading?: boolean; visible?: boolean };

const REQUIRED = ["setText", "show", "hide", "enable", "disable", "onClick", "offClick"] as const;
const MAX_TEXT = 64; // Telegram rejects longer button texts

/** The MainButton if this client can drive it (Telegram 6.0+, every method we need present), else null. */
export function usableMainButton(webApp: TelegramWebApp | undefined | null): BottomButton | null {
  if (!inTelegram(webApp) || !tgSupports(webApp, "6.0")) return null;
  const mb = webApp.MainButton;
  if (!mb || REQUIRED.some((m) => typeof mb[m] !== "function")) return null;
  return mb;
}

export type MainButtonController = {
  /** Applies text/visible/enabled/progress; false if any call failed (then the button is hidden). */
  update(state: MainButtonState): boolean;
  /** Removes our click handler and hides the button. Safe to call more than once. */
  destroy(): void;
};

/** Attaches `onClick` to the MainButton; null when the MainButton can't be used (or attaching failed). */
export function attachMainButton(webApp: TelegramWebApp | undefined | null, onClick: () => void): MainButtonController | null {
  const mb = usableMainButton(webApp);
  if (!mb) return null;
  if (tgSafe("MainButton.onClick", () => (mb.onClick!(onClick), true)) !== true) return null;

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    tgSafe("MainButton.offClick", () => mb.offClick!(onClick));
    tgSafe("MainButton.hideProgress", () => mb.hideProgress?.());
    tgSafe("MainButton.hide", () => mb.hide!());
  };

  const update = (state: MainButtonState): boolean => {
    if (destroyed) return false;
    const ok = tgSafe("MainButton.update", () => {
      const text = state.text.trim().slice(0, MAX_TEXT) || "Continue";
      mb.setText!(text);
      if (state.visible === false) {
        mb.hide!();
        return true;
      }
      mb.show!();
      if (state.disabled || state.loading) mb.disable!();
      else mb.enable!();
      if (state.loading) mb.showProgress?.(false);
      else mb.hideProgress?.();
      return true;
    });
    if (ok !== true) {
      tgSafe("MainButton.hide", () => mb.hide!());
      return false;
    }
    return true;
  };

  return { update, destroy };
}
