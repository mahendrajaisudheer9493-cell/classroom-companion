import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The safe Telegram SDK layer. Stubs behave like the real SDK: methods return the object itself
// (for chaining), which is what crashed the reply and new-assignment pages when an effect returned
// `mb.hide()` and React later called it as a cleanup function.

vi.mock("@/lib/log", () => ({ logEvent: vi.fn(async () => {}) }));

const { tgSafe, tgSupports, haptic, confirmDialog } = await import("@/app/app/_lib/telegram");
const { usableMainButton, attachMainButton } = await import("@/app/app/_lib/main-button");
const { buildPayload } = await import("@/app/app/_lib/client-error");
const clientErrorRoute = await import("@/app/api/client-error/route");
const { logEvent } = await import("@/lib/log");

type Stub = Record<string, unknown>;

function mainButtonStub(overrides: Stub = {}) {
  const mb: Stub = {};
  for (const m of ["setText", "show", "hide", "enable", "disable", "showProgress", "hideProgress", "onClick", "offClick"]) {
    mb[m] = vi.fn(() => mb); // chainable, like Telegram
  }
  return Object.assign(mb, overrides);
}

function webApp(overrides: Stub = {}, version = "7.10") {
  return {
    initData: "query_id=1&user=%7B%7D&hash=x",
    version,
    platform: "android",
    isVersionAtLeast: (v: string) => Number(version.split(".")[0]) * 100 + Number(version.split(".")[1] ?? 0) >= Number(v.split(".")[0]) * 100 + Number(v.split(".")[1] ?? 0),
    MainButton: mainButtonStub(),
    HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn(), selectionChanged: vi.fn() },
    ...overrides,
  };
}

const g = globalThis as unknown as { window?: unknown; location?: unknown; navigator?: unknown };
function install(w: unknown, confirm = vi.fn(() => true)) {
  g.window = { Telegram: w ? { WebApp: w } : undefined, confirm };
  return confirm;
}

describe("safe Telegram SDK layer", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    delete g.window;
  });

  it("tgSafe returns the value, or swallows a throw and logs a warning", () => {
    expect(tgSafe("ok", () => 42)).toBe(42);
    expect(tgSafe("boom", () => {
      throw new Error("WebAppMethodUnsupported");
    })).toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[telegram] boom failed", expect.any(Error));
  });

  it("tgSupports is false when the client is unknown, old, or isVersionAtLeast throws", () => {
    expect(tgSupports(undefined, "6.1")).toBe(false);
    expect(tgSupports(webApp({}, "6.0"), "6.1")).toBe(false);
    expect(tgSupports(webApp({}, "7.0"), "6.1")).toBe(true);
    expect(tgSupports(webApp({ isVersionAtLeast: () => { throw new Error("x"); } }), "6.1")).toBe(false);
  });

  it("haptics: skipped on 6.0 and outside Telegram; a throwing HapticFeedback never throws", () => {
    const old = webApp({}, "6.0");
    install(old);
    haptic.tap();
    expect((old.HapticFeedback.impactOccurred as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    const broken = webApp({ HapticFeedback: { impactOccurred: () => { throw new Error("unsupported"); } } });
    install(broken);
    expect(() => haptic.tap()).not.toThrow();
    expect(() => haptic.success()).not.toThrow(); // method missing → no-op

    install(undefined);
    expect(() => haptic.select()).not.toThrow();
  });

  it("confirmDialog falls back to window.confirm when showConfirm is unsupported or throws", async () => {
    const confirm1 = install(webApp({ showConfirm: vi.fn() }, "6.1")); // showConfirm needs 6.2
    expect(await confirmDialog("Sure?")).toBe(true);
    expect(confirm1).toHaveBeenCalledWith("Sure?");

    const confirm2 = install(webApp({ showConfirm: () => { throw new Error("WebAppPopupOpened"); } }), vi.fn(() => false));
    expect(await confirmDialog("Sure?")).toBe(false);
    expect(confirm2).toHaveBeenCalled();

    install(webApp({ showConfirm: (_m: string, cb: (ok: boolean) => void) => cb(true) }), vi.fn(() => false));
    expect(await confirmDialog("Sure?")).toBe(true); // native dialog used
  });
});

describe("MainButton controller", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("is only used inside Telegram 6.0+ with every method present", () => {
    expect(usableMainButton(undefined)).toBeNull();
    expect(usableMainButton(webApp({ initData: "" }))).toBeNull(); // normal browser
    expect(usableMainButton(webApp({}, "5.9"))).toBeNull();
    expect(usableMainButton(webApp({ MainButton: mainButtonStub({ showProgress: undefined, setText: undefined }) }))).toBeNull();
    expect(usableMainButton(webApp())).not.toBeNull();
  });

  it("update returns a boolean, never the chainable SDK object (the crash)", () => {
    const w = webApp();
    const c = attachMainButton(w, () => {})!;
    const hidden = c.update({ text: "Send reply", visible: false });
    expect(hidden).toBe(true);
    expect(typeof hidden).toBe("boolean");
    expect(w.MainButton.hide).toHaveBeenCalled();
    expect(c.update({ text: "Send reply", disabled: true })).toBe(true);
    expect(w.MainButton.show).toHaveBeenCalled();
    expect(w.MainButton.disable).toHaveBeenCalled();
    expect(c.update({ text: "Send reply", loading: true })).toBe(true);
    expect(w.MainButton.showProgress).toHaveBeenCalledWith(false);
  });

  it("a failing SDK call → update false and the button hidden, so the page shows its own button", () => {
    const w = webApp({ MainButton: mainButtonStub({ setText: () => { throw new Error("WebAppMainButtonParamInvalid"); } }) });
    const c = attachMainButton(w, () => {})!;
    expect(c.update({ text: "Send to students" })).toBe(false);
    expect(w.MainButton.hide).toHaveBeenCalled();
  });

  it("attaching fails safely; destroy is idempotent and survives a throwing offClick", () => {
    expect(attachMainButton(webApp({ MainButton: mainButtonStub({ onClick: () => { throw new Error("x"); } }) }), () => {})).toBeNull();
    const w = webApp({ MainButton: mainButtonStub({ offClick: () => { throw new Error("x"); } }) });
    const c = attachMainButton(w, () => {})!;
    expect(() => c.destroy()).not.toThrow();
    expect(() => c.destroy()).not.toThrow();
    expect(w.MainButton.hide).toHaveBeenCalledTimes(1);
    expect(c.update({ text: "x" })).toBe(false); // destroyed
  });

  it("long or empty texts are clamped (Telegram rejects them)", () => {
    const w = webApp();
    const c = attachMainButton(w, () => {})!;
    c.update({ text: "x".repeat(100) });
    expect((w.MainButton.setText as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toHaveLength(64);
    c.update({ text: "  " });
    expect((w.MainButton.setText as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBe("Continue");
  });
});

describe("client error reporting", () => {
  afterEach(() => {
    delete g.window;
    delete g.location;
  });

  it("payload carries message, stack, path and the Telegram version/platform", () => {
    install(webApp({}, "6.0"));
    g.location = { pathname: "/app/doubts/abc", search: "" };
    const p = buildPayload(new Error("destroy is not a function"), { source: "error-boundary" });
    expect(p).toMatchObject({ message: "destroy is not a function", path: "/app/doubts/abc", source: "error-boundary", tgVersion: "6.0", tgPlatform: "android" });
    expect(p.stack).toContain("destroy is not a function");
    expect(buildPayload("x".repeat(900)).message).toHaveLength(500);
  });

  it("POST /api/client-error logs client.error; rejects junk and oversized bodies", async () => {
    const post = (body: string) => clientErrorRoute.POST(new Request("http://test/api/client-error", { method: "POST", body }));
    const ok = await post(JSON.stringify({ message: "boom", path: "/app/assignments/new", tgVersion: "7.0" }));
    expect(ok.status).toBe(204);
    expect(logEvent).toHaveBeenCalledWith("client.error", expect.objectContaining({ message: "boom", path: "/app/assignments/new", tgVersion: "7.0" }));
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ path: "/x" }))).status).toBe(400);
    expect((await post("x".repeat(9000))).status).toBe(413);
  });
});
