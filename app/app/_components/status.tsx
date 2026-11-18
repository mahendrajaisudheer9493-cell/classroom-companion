import type { TriageFlagName } from "@/app/app/_lib/types";
import { Card } from "@/components/ui/card";
import { statusMeta } from "@/components/ui/status";
import { FlagTags } from "@/components/ui/status-chip";

// Status chips and small tags, shared by every screen.

export { StatusChip } from "@/components/ui/status-chip";

export const statusLabel = (status: string) => statusMeta(status).label;

/** Triage flags as small tinted tags. */
export function Flags({ flags }: { flags: TriageFlagName[] }) {
  return <FlagTags flags={flags} />;
}

/** "just now", "5 min ago", "2 h ago", "3 d ago" */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "no activity";
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function Banner({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" | "success" }) {
  const t = tone === "error" ? "danger" : tone === "success" ? "completed" : "accent";
  return (
    <div role="status" className="mb-4">
      <Card tone={t} className="px-4 py-3 text-body">
        {children}
      </Card>
    </div>
  );
}
