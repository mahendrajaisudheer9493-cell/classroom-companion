// npm run eval: runs the LLM eval sets against the REAL model (a fraction of a cent per run).
// Separate from `npm test`, which never calls the API.
import { config } from "dotenv";
config({ quiet: true });

import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { getEnv } from "@/lib/env";
import { interpretStudentMessage, type StudentInterpretation } from "@/lib/llm/interpret-student";
import { parseTeacherMessage, type TeacherParse } from "@/lib/llm/parse-teacher";
import { IST } from "@/lib/time";

type Row = { pass: boolean; label: string; ms: number; conf: string; message: string; misses: string[] };
const iso = (s: string) => DateTime.fromISO(s, { zone: IST });

function printTable(title: string, rows: Row[]) {
  console.log(`\n── ${title} ──`);
  rows.forEach((r, i) => {
    const msg = r.message.length > 60 ? `${r.message.slice(0, 60)}…` : r.message;
    console.log(`${r.pass ? "PASS" : "FAIL"} | ${String(i + 1).padStart(2)} | ${r.label.padEnd(22)} | conf ${r.conf} | ${String(r.ms).padStart(5)} ms | ${msg}`);
    if (!r.pass) console.log(`     ↳ ${r.misses.join(", ")}`);
  });
  const passed = rows.filter((r) => r.pass).length;
  console.log(`Accuracy: ${passed}/${rows.length} (${Math.round((passed / rows.length) * 100)}%)`);
  return { passed, total: rows.length };
}

// ───────────────────────────── Teacher set ─────────────────────────────

type TeacherExpect = {
  intent: TeacherParse["intent"];
  classNames?: string[];
  dueDate?: string | null;
  timeOfDay?: string | null;
  explicitTime?: string | null;
  notes?: boolean;
  assignmentId?: string;
  subject?: string | null;
  /** words that must survive into the instructions, e.g. "diagram" */
  instructionsInclude?: string;
};

async function runTeacher() {
  const file = JSON.parse(readFileSync("tests/evals/teacher.json", "utf8"));
  const ctx = {
    now: iso(file.now),
    classes: file.classes,
    recentAssignments: file.recentAssignments.map((a: { dueAt: string }) => ({ ...a, dueAt: iso(a.dueAt) })),
  };
  const norm = (xs: string[]) => xs.map((x) => x.toUpperCase().replace(/\s/g, "")).sort().join(",");
  const rows: Row[] = [];
  for (const c of file.cases as { message: string; expect: TeacherExpect }[]) {
    const started = Date.now();
    const result = await parseTeacherMessage(c.message, ctx);
    const misses: string[] = [];
    if (!result.ok) misses.push(`model failure: ${result.reason}`);
    else {
      const got = result.data;
      const change = got.intent === "change";
      const due = change ? (got.changes?.dueDate ?? null) : got.dueDate;
      const tod = change ? (got.changes?.timeOfDay ?? null) : got.timeOfDay;
      const clock = change ? (got.changes?.explicitTime ?? null) : got.explicitTime;
      const e = c.expect;
      if (got.intent !== e.intent) misses.push(`intent=${got.intent}`);
      if (e.classNames && norm(e.classNames) !== norm(got.classNames)) misses.push(`classes=[${got.classNames}]`);
      if (e.dueDate !== undefined && due !== e.dueDate) misses.push(`dueDate=${due}`);
      if (e.timeOfDay !== undefined && tod !== e.timeOfDay) misses.push(`timeOfDay=${tod}`);
      if (e.explicitTime !== undefined && clock !== e.explicitTime) misses.push(`time=${clock}`);
      if (e.notes !== undefined && Boolean(got.notes) !== e.notes) misses.push(`notes=${got.notes ? "set" : "none"}`);
      if (e.assignmentId !== undefined && got.assignmentId !== e.assignmentId) misses.push(`assignmentId=${got.assignmentId}`);
      if (e.subject !== undefined && got.subject !== e.subject) misses.push(`subject=${got.subject}`);
      if (e.instructionsInclude && !`${got.title} ${got.instructions}`.toLowerCase().includes(e.instructionsInclude.toLowerCase())) {
        misses.push(`instructions lost "${e.instructionsInclude}"`);
      }
      // Below the threshold the bot would answer "I couldn't read that", so it counts as a fail.
      if (got.intent !== "other" && got.intent === e.intent && got.confidence < getEnv().LLM_CONFIDENCE_THRESHOLD) {
        misses.push(`conf ${got.confidence} < ${getEnv().LLM_CONFIDENCE_THRESHOLD} → rejected`);
      }
    }
    rows.push({
      pass: misses.length === 0,
      label: c.expect.intent,
      ms: Date.now() - started,
      conf: result.ok ? result.data.confidence.toFixed(2) : " -  ",
      message: c.message,
      misses,
    });
  }
  return printTable(`Teacher messages (now: ${ctx.now.toFormat("ccc d LLL yyyy HH:mm")} IST)`, rows);
}

// ───────────────────────────── Student set ─────────────────────────────

type StudentExpect = { intent: StudentInterpretation["intent"] | StudentInterpretation["intent"][]; assignmentId?: string; doubt?: boolean };

async function runStudent() {
  const file = JSON.parse(readFileSync("tests/evals/student.json", "utf8"));
  const candidates = file.candidates.map((c: { dueAt: string }) => ({ ...c, dueAt: iso(c.dueAt) }));
  const threshold = getEnv().LLM_CONFIDENCE_THRESHOLD;
  const rows: Row[] = [];
  for (const c of file.cases as { message: string; expect: StudentExpect }[]) {
    const started = Date.now();
    const result = await interpretStudentMessage(c.message, candidates);
    const allowed = Array.isArray(c.expect.intent) ? c.expect.intent : [c.expect.intent];
    const misses: string[] = [];
    if (!result.ok) misses.push(`model failure: ${result.reason}`);
    else {
      const got = result.data;
      // What the bot would act on: below the threshold it asks with buttons instead (= "other").
      const acted = got.confidence < threshold ? "other" : got.intent;
      if (!allowed.includes(acted)) misses.push(`intent=${got.intent}${acted !== got.intent ? ` (conf ${got.confidence} < ${threshold} → asks)` : ""}`);
      if (c.expect.assignmentId && got.assignmentId !== c.expect.assignmentId) misses.push(`assignmentId=${got.assignmentId}`);
      if (c.expect.doubt && !got.doubtText) misses.push("doubtText missing");
    }
    rows.push({
      pass: misses.length === 0,
      label: allowed.join("|").slice(0, 22),
      ms: Date.now() - started,
      conf: result.ok ? result.data.confidence.toFixed(2) : " -  ",
      message: c.message,
      misses,
    });
  }
  return printTable("Student messages", rows);
}

async function main() {
  console.log(`Model: ${getEnv().ANTHROPIC_MODEL}`);
  const teacher = await runTeacher();
  const student = await runStudent();
  const passed = teacher.passed + student.passed;
  const total = teacher.total + student.total;
  console.log(`\nOverall: ${passed}/${total} (${Math.round((passed / total) * 100)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
