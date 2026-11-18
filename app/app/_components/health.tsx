import { CircleExclamationPoint, Clock, Eye, FolderOpen, TrendingDown } from "lucide-react";
import type { HealthStatsDto } from "@/app/app/_lib/types";
import { Chip } from "@/components/ui/status-chip";

// School health numbers as chips (all computed on the server). Zero values stay neutral.

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export function HealthLine({ stats }: { stats: HealthStatsDto }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Chip tone="neutral" icon={FolderOpen} size="sm">
        {stats.openAssignments} open
      </Chip>
      <Chip tone={stats.seenPct === null ? "neutral" : stats.seenPct >= 80 ? "completed" : "silent"} icon={Eye} size="sm">
        {pct(stats.seenPct)} seen
      </Chip>
      <Chip tone={stats.overduePct ? "overdue" : "neutral"} icon={Clock} size="sm">
        {pct(stats.overduePct)} overdue
      </Chip>
      <Chip tone={stats.stuck ? "stuck" : "neutral"} icon={CircleExclamationPoint} size="sm">
        {stats.stuck} stuck
      </Chip>
    </span>
  );
}

export function WorstBadge() {
  return (
    <Chip tone="stuck" icon={TrendingDown} size="sm">
      Falling behind
    </Chip>
  );
}
