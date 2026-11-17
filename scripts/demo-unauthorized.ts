// npm run demo:unauthorized [baseUrl]: shows the server refusing wrong-context requests (SYS6).
// Signs genuine initData with the bot token (exactly what Telegram does) for the seeded accounts,
// then calls the Mini App API. baseUrl defaults to APP_URL (the deployed app).
import { config } from "dotenv";
config({ quiet: true });

import { signInitData, type TelegramUser } from "@/lib/auth/init-data";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

type Check = { title: string; as: string; path: string; initData: string; expect: number };

async function main() {
  const env = getEnv();
  const baseUrl = (process.argv[2] ?? env.APP_URL).replace(/\/$/, "");

  const teacher: TelegramUser = { id: Number(env.SEED_TEACHER_TELEGRAM_ID), first_name: "Lakshmi" };
  const ravi: TelegramUser = { id: Number(env.SEED_STUDENT_TELEGRAM_ID), first_name: "Ravi" };
  const sign = (u: TelegramUser) => signInitData(u, env.TELEGRAM_BOT_TOKEN);

  const c8A = await prisma.class.findFirstOrThrow({ where: { name: "8A", school: { name: "Greenfield Public School" } } });
  const c7A = await prisma.class.findFirstOrThrow({ where: { name: "7A", school: { name: "Riverside School" } } });

  // Tampered: Ravi's genuine initData with the user swapped to the teacher's id (privilege escalation attempt).
  const tampered = new URLSearchParams(sign(ravi));
  tampered.set("user", JSON.stringify({ ...ravi, id: teacher.id }));

  const checks: Check[] = [
    { title: "Control: Maths teacher reads her own 8A roster", as: "teacher", path: `/api/app/classes/${c8A.id}`, initData: sign(teacher), expect: 200 },
    { title: "(a) Ravi (student) requests the 8A roster", as: "Ravi", path: `/api/app/classes/${c8A.id}`, initData: sign(ravi), expect: 403 },
    { title: "(b) Maths teacher requests Riverside School 7A roster", as: "teacher", path: `/api/app/classes/${c7A.id}`, initData: sign(teacher), expect: 403 },
    { title: "(c) Tampered initData (Ravi pretending to be the teacher)", as: "forged", path: `/api/app/classes/${c8A.id}`, initData: tampered.toString(), expect: 401 },
  ];

  console.log(`Target: ${baseUrl}\n`);
  let failures = 0;
  for (const c of checks) {
    const res = await fetch(baseUrl + c.path, { headers: { Authorization: `tma ${c.initData}` } });
    const body = await res.json().catch(() => ({}));
    const pass = res.status === c.expect;
    if (!pass) failures++;
    const summary = res.ok ? `roster of ${body.class?.name}: ${body.linked}/${body.total} linked` : JSON.stringify(body);
    console.log(`${pass ? "✓" : "✗"} ${c.title}`);
    console.log(`    as ${c.as} → GET ${c.path}`);
    console.log(`    HTTP ${res.status} (expected ${c.expect}) ${summary}\n`);
  }
  console.log(failures === 0 ? "All checks behaved as expected." : `${failures} check(s) did NOT behave as expected.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("✗ Failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
