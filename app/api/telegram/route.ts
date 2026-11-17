import { webhookCallback } from "grammy";
import { safeEqual } from "@/lib/auth/init-data";
import { getBot } from "@/lib/bot/bot";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";

export const maxDuration = 60;

let handleUpdate: ((request: Request) => Promise<Response>) | undefined;

// POST /api/telegram: Telegram webhook. Only Telegram knows TELEGRAM_WEBHOOK_SECRET
// (we pass it in setWebhook), so any request without it is rejected before grammY sees it.
export async function POST(request: Request) {
  const env = getEnv();
  const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
    await logEvent("access.denied", { reason: "bad_webhook_secret", path: "/api/telegram" });
    return new Response("unauthorized", { status: 401 });
  }

  handleUpdate ??= webhookCallback(getBot(), "std/http", {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
    timeoutMilliseconds: 55_000, // below maxDuration, so we answer Telegram before Vercel kills us
  });
  return handleUpdate(request);
}
