import { z } from "zod";

// Telegram user IDs can exceed 2^53, so we keep them as BigInt (matches User.telegramId).
export const telegramId = z
  .string()
  .trim()
  .regex(/^\d+$/, "must be a numeric Telegram user ID (get it from @userinfobot)")
  .transform((s) => BigInt(s));

const hour = z.coerce.number().int().min(0).max(23);

const envSchema = z
  .object({
    // Database (Supabase)
    DATABASE_URL: z.string().url("must be a postgres:// URL (Supabase pooled, port 6543)"),
    DIRECT_URL: z.string().url("must be a postgres:// URL (Supabase direct, port 5432)"),

    // Telegram
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d+:[\w-]+$/, "must look like 123456:ABC-... (from @BotFather)"),
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,256}$/, "must be 16-256 chars of A-Z a-z 0-9 _ -"),
    TELEGRAM_BOT_USERNAME: z
      .string()
      .regex(/^[A-Za-z0-9_]{5,}$/, "bot username without the @, e.g. ClassroomCompanionBot"),

    // App
    APP_URL: z.string().url("must be the public https URL of the app"),
    CRON_SECRET: z.string().min(16, "must be at least 16 characters"),

    // LLM
    ANTHROPIC_API_KEY: z.string().min(1, "is required (from console.anthropic.com)"),
    ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),
    LLM_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

    // Scheduling (all hours/times are IST)
    QUIET_HOURS_ENABLED: z.stringbool().default(true),
    QUIET_HOURS_START: hour.default(21),
    QUIET_HOURS_END: hour.default(7),
    SILENT_AFTER_MINUTES: z.coerce.number().int().positive().default(720),
    /** Demo only: "still stuck?" check-in this many minutes after blocking (unset → 07:00 next morning). */
    BLOCKED_CHECKIN_AFTER_MINUTES: z.coerce.number().int().positive().optional(),
    DUE_SOON_HOUR: hour.default(18),
    DIGEST_TIME: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM in 24h IST, e.g. 07:30")
      .default("07:30"),

    // Demo / dev
    DEMO_MODE: z.stringbool().default(false),
    DEV_AUTH_TELEGRAM_ID: telegramId.optional(),

    // Seed
    SEED_TEACHER_TELEGRAM_ID: telegramId,
    SEED_STUDENT_TELEGRAM_ID: telegramId,
    SEED_COORDINATOR_TELEGRAM_ID: telegramId.optional(),
  })
  .transform((e) => ({
    ...e,
    SEED_COORDINATOR_TELEGRAM_ID: e.SEED_COORDINATOR_TELEGRAM_ID ?? e.SEED_TEACHER_TELEGRAM_ID,
  }));

export type Env = z.infer<typeof envSchema>;

/** Validates an env object; throws one error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings as "not set" so defaults and "required" messages apply.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "(env)";
      const missing = issue.code === "invalid_type" && !(name in cleaned);
      return `  - ${name}: ${missing ? "is missing" : issue.message}`;
    });
    throw new Error(
      `Invalid environment variables:\n${lines.join("\n")}\nSee .env.example for what each one means.`,
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated env, parsed once on first use (not at import, so `next build` can import modules). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
