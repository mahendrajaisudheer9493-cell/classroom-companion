import { getEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { validateInitData } from "@/lib/auth/init-data";
import { isLinked, loadAppUserByTelegramId, type AppUser } from "@/lib/auth/user";

/**
 * Who is calling the Mini App API. Identity comes ONLY from Telegram-signed initData in
 * "Authorization: tma <initData>", checked with HMAC on every request (max age 24 h).
 * Dev-only bypass: DEV_AUTH_TELEGRAM_ID when NODE_ENV !== "production".
 */
export async function getRequestUser(request: Request): Promise<AppUser> {
  const env = getEnv();
  const header = request.headers.get("authorization") ?? "";
  const initData = header.startsWith("tma ") ? header.slice(4) : "";
  const path = new URL(request.url).pathname;

  let telegramId: bigint;
  if (!initData && process.env.NODE_ENV !== "production" && env.DEV_AUTH_TELEGRAM_ID) {
    telegramId = env.DEV_AUTH_TELEGRAM_ID;
  } else {
    const result = validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
    if (!result.ok) {
      await logEvent("access.denied", { reason: `init_data_${result.reason}`, path });
      throw new HttpError(401, {
        error: "unauthorized",
        message: "Open this app from the Classroom Companion bot in Telegram.",
      });
    }
    telegramId = BigInt(result.user.id);
  }

  const user = await loadAppUserByTelegramId(telegramId);
  if (!user || !isLinked(user)) {
    throw new HttpError(401, {
      error: "not_linked",
      message: "You haven't joined a class yet. Ask your teacher for your class link.",
    });
  }
  return user;
}
