import { createHmac, timingSafeEqual } from "node:crypto";

// Telegram Mini App initData validation.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//   secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   hash       = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
//   data_check_string = every field except `hash`, as "key=value", sorted by key, joined by "\n"

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: "missing" | "invalid_hash" | "expired" };

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
}

function computeHash(params: URLSearchParams, botToken: string): string {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secret).update(dataCheckString(params)).digest("hex");
}

/** Constant-time string comparison (for hashes and shared secrets). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validateInitData(
  initData: string | null | undefined,
  botToken: string,
  maxAgeSeconds = 86400,
  nowSeconds = Math.floor(Date.now() / 1000),
): InitDataResult {
  if (!initData) return { ok: false, reason: "missing" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const userJson = params.get("user");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !userJson || !Number.isFinite(authDate)) return { ok: false, reason: "missing" };

  if (!safeEqual(computeHash(params, botToken), hash)) return { ok: false, reason: "invalid_hash" };
  if (nowSeconds - authDate > maxAgeSeconds) return { ok: false, reason: "expired" };

  try {
    const user = JSON.parse(userJson) as TelegramUser;
    if (typeof user.id !== "number") return { ok: false, reason: "missing" };
    return { ok: true, user, authDate };
  } catch {
    return { ok: false, reason: "missing" };
  }
}

/** Builds valid signed initData. For tests and scripts/demo-unauthorized.ts only; real initData comes from Telegram. */
export function signInitData(
  user: TelegramUser,
  botToken: string,
  authDate = Math.floor(Date.now() / 1000),
): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: `demo-${authDate}`,
    user: JSON.stringify(user),
  });
  params.set("hash", computeHash(params, botToken));
  return params.toString();
}
