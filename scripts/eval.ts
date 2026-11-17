// npm run eval: runs tests/evals/teacher.json against the REAL model (costs a few cents).
// Separate from `npm test`, which never calls the API.
import { config } from "dotenv";
config({ quiet: true });

import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { parseTeacherMessage, type TeacherParse } from "@/lib/llm/parse-teacher";
import { getEnv } from "@/lib/env";
import { IST } from "@/lib/time";

type Expect = {
  intent: TeacherParse["intent"];
  classNames?: string[];
  dueDate?: string | null;
  timeOfDay?: string | null;
  explicitTime?: string | null;
  notes?: boolean;
  assignmentId?: string;
};
type EvalFile = {
  now: string;
  classes: { name: string; subjects: string[] }[];
  recentAssignments: { id: string; subject: string; className: string; title: string; dueAt: string }[];
  cases: { message: string; expect: Expect }[];
};

const file: EvalFile = JSON.parse(readFileSync("tests/evals/teacher.json", "utf8"));
const ctx = {
  now: DateTime.fromISO(file.now, { zone: IST }),
  classes: file.classes,
  recentAssignments: file.recentAssignments.map((a) => ({ ...a, dueAt: DateTime.fromISO(a.dueAt, { zone: IST }) })),
};

function check(expect: Expect, got: TeacherParse): string[] {
  const misses: string[] = [];
  const isChange = got.intent === "change";
  const due = isChange ? got.changes?.dueDate ?? null : got.dueDate;
  const tod = isChange ? got.changes?.timeOfDay ?? null : got.timeOfDay;
  const clock = isChange ? got.changes?.explicitTime ?? null : got.explicitTime;
  const norm = (xs: string[]) => xs.map((x) => x.toUpperCase().replace(/\s/g, "")).sort().join(",");

  if (got.intent !== expect.intent) misses.push(`intent=${got.intent}`);
  if (expect.classNames && norm(expect.classNames) !== norm(got.classNames)) misses.push(`classes=[${got.classNames}]`);
  if (expect.dueDate !== undefined && due !== expect.dueDate) misses.push(`dueDate=${due}`);
  if (expect.timeOfDay !== undefined && tod !== expect.timeOfDay) misses.push(`timeOfDay=${tod}`);
  if (expect.explicitTime !== undefined && clock !== expect.explicitTime) misses.push(`time=${clock}`);
  if (expect.notes !== undefined && Boolean(got.notes) !== expect.notes) misses.push(`notes=${got.notes ? "set" : "none"}`);
  if (expect.assignmentId !== undefined && got.assignmentId !== expect.assignmentId) misses.push(`assignmentId=${got.assignmentId}`);
  return misses;
}

async function main() {
  console.log(`Model: ${getEnv().ANTHROPIC_MODEL} · now: ${ctx.now.toFormat("ccc d LLL yyyy HH:mm")} IST · ${file.cases.length} cases\n`);
  let passed = 0;
  const rows: string[] = [];
  for (const [i, c] of file.cases.entries()) {
    const started = Date.now();
    const result = await parseTeacherMessage(c.message, ctx);
    const ms = Date.now() - started;
    const misses = result.ok ? check(c.expect, result.data) : [`model failure: ${result.reason}`];
    if (misses.length === 0) passed++;
    const conf = result.ok ? result.data.confidence.toFixed(2) : "-";
    rows.push(
      `${misses.length === 0 ? "PASS" : "FAIL"} | ${String(i + 1).padStart(2)} | ${c.expect.intent.padEnd(6)} | conf ${conf} | ${String(ms).padStart(5)} ms | ${c.message.slice(0, 60)}${c.message.length > 60 ? "…" : ""}${misses.length ? `\n     ↳ ${misses.join(", ")}` : ""}`,
    );
  }
  console.log(rows.join("\n"));
  console.log(`\nAccuracy: ${passed}/${file.cases.length} (${Math.round((passed / file.cases.length) * 100)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
