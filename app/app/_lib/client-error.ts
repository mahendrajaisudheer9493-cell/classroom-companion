import { webAppNow } from "@/app/app/_lib/telegram";

// Sends client-side errors to POST /api/client-error (logged as `client.error`) so a crash on a
// real phone shows up in the Vercel logs with its message, stack, page and Telegram version.

const sent = new Set<string>();
const MAX_PER_PAGE = 5;

export type ClientErrorPayload = {
  message: string;
  stack?: string;
  digest?: string;
  path: string;
  source?: string;
  tgVersion?: string;
  tgPlatform?: string;
  userAgent?: string;
};

export function describeError(error: unknown): { message: string; stack?: string; digest?: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack, digest: (error as Error & { digest?: string }).digest };
  return { message: typeof error === "string" ? error : JSON.stringify(error ?? "unknown error") };
}

export function buildPayload(error: unknown, extra: { source?: string } = {}): ClientErrorPayload {
  const w = webAppNow();
  const { message, stack, digest } = describeError(error);
  return {
    message: message.slice(0, 500),
    stack: stack?.slice(0, 4000),
    digest,
    path: typeof location === "undefined" ? "" : location.pathname + location.search,
    source: extra.source,
    tgVersion: w?.version,
    tgPlatform: w?.platform,
    userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent.slice(0, 300),
  };
}

/** Logs to the console and reports once per distinct message (max 5 per page). Never throws. */
export function reportClientError(error: unknown, extra: { source?: string } = {}) {
  try {
    console.error("[client error]", error);
    const payload = buildPayload(error, extra);
    const key = `${payload.message}|${payload.path}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // reporting must never cause another error
  }
}
