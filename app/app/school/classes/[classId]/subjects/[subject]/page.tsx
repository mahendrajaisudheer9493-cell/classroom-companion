"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Loading, Notice } from "@/app/app/_components/ui";
import { Chip, ListRow, SectionHeader, StatusBar, StatusChip } from "@/components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { SubjectDetailResponse } from "@/app/app/_lib/types";

// /app/school/classes/:id/subjects/:subject: each assignment with student names + status chips only.
function SubjectDetail() {
  const { classId, subject } = useParams<{ classId: string; subject: string }>();
  const [data, setData] = useState<ApiResult<SubjectDetailResponse> | null>(null);
  useEffect(() => {
    apiFetch<SubjectDetailResponse>(`/api/app/school/classes/${classId}/subjects/${subject}`).then(setData);
  }, [classId, subject]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const d = data.data;
  return (
    <>
      <BackNav fallbackHref={`/app/school/classes/${classId}`} />
      <h1 className="text-large font-bold">
        {d.class.name} · {d.subject}
      </h1>
      <p className="mb-4 text-body text-tg-hint">Names and statuses only. Submissions and feedback stay with the teachers.</p>
      {d.assignments.length === 0 && <p className="py-6 text-center text-tg-hint">No published assignments.</p>}
      {d.assignments.map((a) => {
        const counts: Record<string, number> = {};
        for (const s of a.students) counts[s.status] = (counts[s.status] ?? 0) + 1;
        return (
          <section key={a.id} className="mb-6">
            <SectionHeader title={`${a.title} · due ${a.dueLabel}`} />
            <div className="overflow-hidden rounded-2xl bg-surface">
              <div className="space-y-2.5 px-4 py-3">
                <StatusBar counts={counts} />
              </div>
              {a.students.map((s, i) => (
                <ListRow
                  key={`${s.name}-${i}`}
                  avatar={s.name}
                  title={s.name}
                  detail={
                    <>
                      {s.overdue && (
                        <Chip tone="overdue" size="sm">
                          Overdue
                        </Chip>
                      )}
                      <StatusChip status={s.status} size="sm" />
                    </>
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

export default function SubjectDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SubjectDetail />
    </Suspense>
  );
}
