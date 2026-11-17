import type { HealthStatsDto } from "@/app/app/_lib/types";

// "3 open · 82% seen · 12% overdue · 2 stuck": school health numbers (all computed on the server).

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export function HealthLine({ stats }: { stats: HealthStatsDto }) {
  return (
    <p className="text-sm text-tg-hint">
      {stats.openAssignments} open · {pct(stats.seenPct)} seen · <span className={stats.overduePct ? "text-tg-destructive" : ""}>{pct(stats.overduePct)} overdue</span> ·{" "}
      <span className={stats.stuck ? "text-tg-destructive" : ""}>{stats.stuck} stuck</span>
    </p>
  );
}

export function WorstBadge() {
  return <span className="shrink-0 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">⚠ falling behind</span>;
}
