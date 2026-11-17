import { safeEqual } from "@/lib/auth/init-data";
import { acquireLease, releaseLease, runTick } from "@/lib/domain/tick";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";

export const maxDuration = 60;

// POST /api/tick (Authorization: Bearer CRON_SECRET), called every minute by Supabase pg_cron.
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${getEnv().CRON_SECRET}`)) {
    await logEvent("access.denied", { reason: "bad_cron_secret", path: "/api/tick" });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!(await acquireLease("tick", 55))) return Response.json({ skipped: true, reason: "another tick is running" });

  const started = Date.now();
  try {
    const summary = await runTick();
    const result = { ok: true, ms: Date.now() - started, ...summary };
    await logEvent("tick.done", result);
    return Response.json(result);
  } catch (err) {
    await logEvent("tick.error", { error: err });
    return Response.json({ ok: false, error: "tick failed" }, { status: 500 });
  } finally {
    await releaseLease("tick");
  }
}
