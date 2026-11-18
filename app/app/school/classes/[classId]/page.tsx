"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { HealthLine, WorstBadge } from "@/app/app/_components/health";
import { BackNav } from "@/app/app/_components/nav";
import { Loading, Notice } from "@/app/app/_components/ui";
import { Card, ListRow, ProgressBar, SectionHeader } from "@/components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { ClassHealthResponse } from "@/app/app/_lib/types";

// /app/school/classes/:id: the school-health numbers per subject; tap a subject → assignments + names.
function ClassHealth() {
  const { classId } = useParams<{ classId: string }>();
  const [data, setData] = useState<ApiResult<ClassHealthResponse> | null>(null);
  useEffect(() => {
    apiFetch<ClassHealthResponse>(`/api/app/school/classes/${classId}`).then(setData);
  }, [classId]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const d = data.data;
  return (
    <>
      <BackNav fallbackHref="/app/school" />
      <Card className="mb-6">
        <p className="text-caption font-medium text-tg-hint">{d.school.name}</p>
        <h1 className="mb-2 text-title font-bold">{d.class.name}</h1>
        <HealthLine stats={d.stats} />
        <ProgressBar
          className="mt-3"
          value={d.class.linked}
          max={d.class.total}
          label={
            <>
              <span>On Telegram</span>
              <span className="tabular-nums">
                {d.class.linked} / {d.class.total}
              </span>
            </>
          }
        />
      </Card>
      <SectionHeader title="By subject" />
      <div className="mb-6 overflow-hidden rounded-2xl bg-surface">
        {d.subjects.length === 0 && <p className="px-4 py-3 text-body text-tg-hint">No published assignments yet.</p>}
        {d.subjects.map((s) => (
          <ListRow
            key={s.subject}
            href={`/app/school/classes/${d.class.id}/subjects/${encodeURIComponent(s.subject)}`}
            avatar={s.subject}
            title={s.subject}
            className={s.subject === d.worstSubject ? "tone-stuck shadow-[inset_3px_0_0_var(--tone)]" : undefined}
          >
            {s.subject === d.worstSubject && (
              <div className="mb-1.5">
                <WorstBadge />
              </div>
            )}
            <HealthLine stats={s.stats} />
          </ListRow>
        ))}
      </div>
    </>
  );
}

export default function ClassHealthPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClassHealth />
    </Suspense>
  );
}
