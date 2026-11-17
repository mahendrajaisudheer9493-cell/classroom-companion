import { describe, expect, it } from "vitest";
import { signInitData, validateInitData } from "@/lib/auth/init-data";

const BOT_TOKEN = "123456:TEST-token_for-unit-tests";
const user = { id: 8164584223, first_name: "Lakshmi", username: "lakshmi" };
const now = 1_800_000_000;

describe("validateInitData", () => {
  it("accepts initData signed with the bot token", () => {
    const result = validateInitData(signInitData(user, BOT_TOKEN, now - 60), BOT_TOKEN, 86400, now);
    expect(result).toEqual({ ok: true, user, authDate: now - 60 });
  });

  it("rejects a tampered hash", () => {
    const params = new URLSearchParams(signInitData(user, BOT_TOKEN, now));
    const hash = params.get("hash")!;
    params.set("hash", (hash[0] === "a" ? "b" : "a") + hash.slice(1));
    expect(validateInitData(params.toString(), BOT_TOKEN, 86400, now)).toEqual({ ok: false, reason: "invalid_hash" });
  });

  it("rejects tampered data (someone swaps in another user id)", () => {
    const params = new URLSearchParams(signInitData(user, BOT_TOKEN, now));
    params.set("user", JSON.stringify({ ...user, id: 8533149607 }));
    expect(validateInitData(params.toString(), BOT_TOKEN, 86400, now)).toEqual({ ok: false, reason: "invalid_hash" });
  });

  it("rejects initData signed with a different bot token", () => {
    const result = validateInitData(signInitData(user, "999:other-bot", now), BOT_TOKEN, 86400, now);
    expect(result).toEqual({ ok: false, reason: "invalid_hash" });
  });

  it("rejects an expired auth_date (older than 24 h)", () => {
    const result = validateInitData(signInitData(user, BOT_TOKEN, now - 86401), BOT_TOKEN, 86400, now);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects missing initData", () => {
    expect(validateInitData("", BOT_TOKEN)).toEqual({ ok: false, reason: "missing" });
    expect(validateInitData("auth_date=1&hash=abc", BOT_TOKEN)).toEqual({ ok: false, reason: "missing" });
  });
});
