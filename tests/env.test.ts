import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@host:6543/postgres?pgbouncer=true&connection_limit=1",
  DIRECT_URL: "postgresql://u:p@host:5432/postgres",
  TELEGRAM_BOT_TOKEN: "123456:ABC-def_ghi",
  TELEGRAM_WEBHOOK_SECRET: "a".repeat(32),
  TELEGRAM_BOT_USERNAME: "ClassroomBot",
  APP_URL: "https://example.vercel.app",
  CRON_SECRET: "b".repeat(32),
  ANTHROPIC_API_KEY: "sk-ant-test",
  SEED_TEACHER_TELEGRAM_ID: "111111111",
  SEED_STUDENT_TELEGRAM_ID: "222222222",
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.ANTHROPIC_MODEL).toBe("claude-haiku-5-5");
    expect(env.LLM_CONFIDENCE_THRESHOLD).toBe(0.7);
    expect(env.LLM_TIMEOUT_MS).toBe(8000);
    expect(env.QUIET_HOURS_START).toBe(21);
    expect(env.QUIET_HOURS_END).toBe(7);
    expect(env.SILENT_AFTER_MINUTES).toBe(720);
    expect(env.DUE_SOON_HOUR).toBe(18);
    expect(env.DIGEST_TIME).toBe("07:30");
    expect(env.DEMO_MODE).toBe(false);
    expect(env.DEV_AUTH_TELEGRAM_ID).toBeUndefined();
  });

  it("parses numbers, booleans and Telegram IDs", () => {
    const env = parseEnv({ ...valid, SILENT_AFTER_MINUTES: "2", DEMO_MODE: "true" });
    expect(env.SILENT_AFTER_MINUTES).toBe(2);
    expect(env.DEMO_MODE).toBe(true);
    expect(env.SEED_TEACHER_TELEGRAM_ID).toBe(111111111n);
  });

  it("defaults the coordinator to the teacher's Telegram ID", () => {
    expect(parseEnv(valid).SEED_COORDINATOR_TELEGRAM_ID).toBe(111111111n);
    expect(parseEnv({ ...valid, SEED_COORDINATOR_TELEGRAM_ID: "333" }).SEED_COORDINATOR_TELEGRAM_ID).toBe(333n);
  });

  it("treats empty strings as unset", () => {
    expect(parseEnv({ ...valid, DEV_AUTH_TELEGRAM_ID: "", DIGEST_TIME: "" }).DIGEST_TIME).toBe("07:30");
  });

  it("lists every missing or invalid variable in one error", () => {
    const broken = { ...valid, ANTHROPIC_API_KEY: undefined, DIGEST_TIME: "7.30" };
    expect(() => parseEnv(broken)).toThrow(
      /ANTHROPIC_API_KEY: is missing[\s\S]*DIGEST_TIME: must be HH:MM/,
    );
  });
});
