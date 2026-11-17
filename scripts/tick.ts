// npm run tick: calls POST APP_URL/api/tick once with the cron secret and prints the result.
// Optional base URL: npm run tick -- http://localhost:3000
import { config } from "dotenv";
config({ quiet: true });

import { getEnv } from "@/lib/env";

async function main() {
  const env = getEnv();
  const url = new URL("/api/tick", process.argv[2] ?? env.APP_URL).toString();
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  console.log(`POST ${url} → HTTP ${res.status}`);
  console.log(JSON.stringify(await res.json().catch(() => ({})), null, 2));
  if (!res.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error("✗ Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
