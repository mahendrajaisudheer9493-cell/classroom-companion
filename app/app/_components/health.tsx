import { TrendingDown } from "lucide-react";
import type { HealthStatsDto } from "@/app/app/_lib/types";
import { Chip } from "@/components/ui/status-chip";

// "3 open · 82% seen · 12% overdue · 2 stuck": school health numbers (all computed on the server).

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export function HealthLine({ stats }: { stats: HealthStatsDto }) {
  return (
    <p className="text-sm text-tg-hint">
      {stats.openAssignments} open · {pct(stats.seenPct)} seen · <span className={stats.overduePct ? "tone-overdue text-tone font-medium" : ""}>{pct(stats.overduePct)} overdue</span> ·{" "}
      <span className={stats.stuck ? "tone-stuck text-tone font-medium" : ""}>{stats.stuck} stuck</span>
    </p>
  );
}

export function WorstBadge() {
  return (
    <Chip tone="stuck" icon={TrendingDown} size="sm">
      falling behind
    </Chip>
  );
}
