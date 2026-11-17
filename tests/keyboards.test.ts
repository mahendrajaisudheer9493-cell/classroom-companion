import { describe, expect, it } from "vitest";
import { callbackData, CB } from "@/lib/bot/keyboards";
import { generateCode } from "@/lib/domain/linking";

describe("callback data", () => {
  it("fits the longest callback (pick: two cuids) in 64 bytes", () => {
    const cuid = "cmhxyz0000000000000000000"; // 25 chars, like Prisma cuid()
    expect(Buffer.byteLength(callbackData(CB.pick, cuid, cuid))).toBeLessThanOrEqual(64);
  });

  it("refuses data over 64 bytes", () => {
    expect(() => callbackData("x", "a".repeat(70))).toThrow(/64 bytes/);
  });
});

describe("join codes", () => {
  it("are 6 easy-to-read characters", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
