import type { RiskStudentDto } from "@/app/app/_lib/types";
import { teachingSlots } from "@/lib/domain/assignments";
import { isOverdue, isSilent, isStuck, loadTriageRows, type TriageRow } from "@/lib/domain/triage";
import { getEnv } from "@/lib/env";

// "Who is at risk this week?" for a subject teacher: students in their class+subjects with 2 or more
// warning signs. Every signal and count is computed by code from the triage rows (no model).

export type RiskSignal = "stuck" | "silent" | "overdue" | "needs_revision" | "many_overdue";
export const RISK_WINDOW_DAYS = 7;
const SIGNAL_ORDER: RiskSignal[] = ["stuck", "overdue", "many_overdue", "needs_revision", "silent"];
const DAY = 86_400_000;

/** "This week" = work due from 7 days ago to 7 days ahead. */
export const inRiskWindow = (r: TriageRow, now: Date) =>
  Math.abs(r.dueAt.getTime() - now.getTime()) <= RISK_WINDOW_DAYS * DAY;

/** Students with 2+ distinct signals, most signals first. "2+ overdue items" is its own signal. */
export function riskFrom(rows: TriageRow[], now: Date, silentAfterMinutes: number): RiskStudentDto[] {
  const byStudent = new Map<string, TriageRow[]>();
  for (const r of rows) {
    if (!inRiskWindow(r, now)) continue;
    byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  }

  const out: RiskStudentDto[] = [];
  for (const [studentId, rs] of byStudent) {
    const titles = (pred: (r: TriageRow) => boolean) => rs.filter(pred).map((r) => `${r.subject} · ${r.title}`);
    const found: Partial<Record<RiskSignal, string[]>> = {};
    const stuck = titles(isStuck);
    const overdue = titles((r) => isOverdue(r, now));
    const revision = titles((r) => r.status === "NEEDS_REVISION");
    const silent = titles((r) => r.linked && isSilent(r, now, silentAfterMinutes));
    if (stuck.length) found.stuck = stuck;
    if (overdue.length) found.overdue = overdue;
    if (overdue.length >= 2) found.many_overdue = overdue;
    if (revision.length) found.needs_revision = revision;
    if (silent.length) found.silent = silent;

    const signals = SIGNAL_ORDER.filter((s) => found[s]);
    if (signals.length < 2) continue;
    out.push({
      studentId,
      name: rs[0].studentName,
      className: rs[0].className,
      signals,
      reasons: signals
        .filter((s) => s !== "many_overdue") // shown as "overdue ×N" instead
        .map((s) => {
          const list = found[s]!;
          const label = s === "overdue" && list.length >= 2 ? `overdue ×${list.length}` : s.replace("_", " ");
          return `${label}: ${list.join(", ")}`;
        }),
    });
  }
  return out.sort((a, b) => b.signals.length - a.signals.length || a.name.localeCompare(b.name));
}

export async function atRiskFor(user: Parameters<typeof teachingSlots>[0], now = new Date()): Promise<RiskStudentDto[]> {
  const rows = await loadTriageRows(teachingSlots(user));
  return riskFrom(rows, now, getEnv().SILENT_AFTER_MINUTES);
}
