import type { TriageItemDto, TriageResponse } from "@/app/app/_lib/types";
import { teachingSlots } from "@/lib/domain/assignments";
import { computeTriage, loadTriageRows, type TriageItem } from "@/lib/domain/triage";
import { getEnv } from "@/lib/env";
import { formatIst } from "@/lib/time";

const toDto = (i: TriageItem): TriageItemDto => ({
  saId: i.saId,
  assignmentId: i.assignmentId,
  studentName: i.studentName,
  className: i.className,
  assignment: `${i.subject} · ${i.title}`,
  status: i.status,
  dueLabel: formatIst(i.dueAt),
  flags: i.flags,
  lastActivityAt: i.lastActivityAt?.toISOString() ?? null,
  since: i.since?.toISOString() ?? null,
});

/** The triage board for a subject teacher (optionally one class). */
export async function triageFor(user: Parameters<typeof teachingSlots>[0], classId?: string): Promise<TriageResponse> {
  const slots = teachingSlots(user);
  const rows = await loadTriageRows(slots, classId);
  const t = computeTriage(rows, new Date(), { silentAfterMinutes: getEnv().SILENT_AFTER_MINUTES });
  const classes = [...new Map(slots.map((s) => [s.classId, { id: s.classId, name: s.className }])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return {
    classes,
    counts: t.counts,
    stuck: t.stuck.map(toDto),
    silent: t.silent.map(toDto),
    overdue: t.overdue.map(toDto),
    toReview: t.toReview.map(toDto),
  };
}
