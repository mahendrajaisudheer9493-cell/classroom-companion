import { z } from "zod";
import { logEvent } from "@/lib/log";

// POST /api/client-error: a Mini App page crashed or threw on a phone. Logged as `client.error`
// (JSON line in the Vercel logs). No auth: the crash may happen before sign-in; input is capped.

const schema = z.object({
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  digest: z.string().max(100).optional(),
  path: z.string().max(300),
  source: z.string().max(40).optional(),
  tgVersion: z.string().max(20).optional(),
  tgPlatform: z.string().max(40).optional(),
  userAgent: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 8000) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  await logEvent("client.error", parsed.data);
  return new Response(null, { status: 204 });
}
