"use client";

import { CircleCheckBig, Settings, TrendingDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HealthLine, WorstBadge } from "@/app/app/_components/health";
import { BackNav } from "@/app/app/_components/nav";
import { Loading, Notice } from "@/app/app/_components/ui";
import { Button, Card, ListRow, ProgressBar, SectionHeader } from "@/components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { SchoolHealthResponse } from "@/app/app/_lib/types";

// /app/school: per class, open work, % seen, % overdue, stuck, linked/total; worst class flagged (C2).
// Coordinator only (server-checked). Names + statuses only, never submissions or feedback.
export function SchoolHealth() {
  const schoolId = useSearchParams().get("schoolId");
  const [data, setData] = useState<ApiResult<SchoolHealthResponse> | null>(null);
  useEffect(() => {
    apiFetch<SchoolHealthResponse>(`/api/app/school${schoolId ? `?schoolId=${schoolId}` : ""}`).then(setData);
  }, [schoolId]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const { school, classes, worstClassId } = data.data;
  const worst = classes.find((c) => c.id === worstClassId);

  return (
    <>
      <BackNav />
      <h1 className="text-large font-bold">School health</h1>
      <p className="mb-4 text-body text-tg-hint">{school.name}</p>

      {worst ? (
        <Card tone="stuck" className="mb-6 flex items-start gap-3">
          <TrendingDown aria-hidden size={22} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-headline font-semibold">{worst.name} is falling behind</p>
            <p className="text-body">
              {worst.stats.overduePct ?? 0}% overdue · {worst.stats.stuck} stuck
            </p>
          </div>
        </Card>
      ) : (
        <Card tone="completed" className="mb-6 flex items-center gap-3">
          <CircleCheckBig aria-hidden size={22} />
          <p className="text-headline font-semibold">No class is falling behind</p>
        </Card>
      )}

      <SectionHeader title={`Classes · ${classes.length}`} />
      <div className="mb-6 overflow-hidden rounded-2xl bg-surface">
        {classes.map((c) => (
          <ListRow
            key={c.id}
            href={`/app/school/classes/${c.id}`}
            avatar={c.name}
            title={c.name}
            subtitle={`On Telegram ${c.linked} / ${c.total}`}
            className={c.id === worstClassId ? "tone-stuck shadow-[inset_3px_0_0_var(--tone)]" : undefined}
          >
            {c.id === worstClassId && (
              <div className="mb-1.5">
                <WorstBadge />
              </div>
            )}
            <HealthLine stats={c.stats} />
            <ProgressBar className="mt-2" value={c.linked} max={c.total} tone={c.total > 0 && c.linked === c.total ? "completed" : "accent"} />
          </ListRow>
        ))}
      </div>

      <Button href={`/app/school/setup${schoolId ? `?schoolId=${schoolId}` : ""}`} variant="secondary" icon={Settings} block>
        School setup: classes, teachers, invites
      </Button>
      <p className="mt-3 px-1 text-caption text-tg-hint">Seen = delivered work the student has acted on in its latest version. Overdue = past due and not handed in.</p>
    </>
  );
}
