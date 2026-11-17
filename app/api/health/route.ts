import { DateTime } from "luxon";
import { connection } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/health → { ok, db, time } — used by uptime checks and the demo setup.
export async function GET() {
  await connection(); // always run at request time, never prerendered at build

  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch (err) {
    console.error(JSON.stringify({ event: "health.db_error", error: String(err) }));
  }

  const time = DateTime.now().setZone("Asia/Kolkata").toISO();
  return Response.json({ ok: db, db, time }, { status: db ? 200 : 503 });
}
