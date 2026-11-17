"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { HealthLine } from "@/app/app/_components/health";
import { BackNav } from "@/app/app/_components/nav";
import { StatusChip } from "@/app/app/_components/status";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
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
      <h1 className="text-xl font-semibold">
        {d.class.name} · {d.subject}
      </h1>
      <p className="mb-5 text-xs text-tg-hint">Names and statuses only. Submissions and feedback stay with the teachers.</p>
      {d.assignments.map((a) => (
        <Section key={a.id} title={`${a.title} · due ${a.dueLabel}`}>
          <div className="border-b border-tg-hint/15 px-4 py-2">
            <HealthLine stats={a.stats} />
          </div>
          {a.students.map((s, i) => (
            <Row key={`${s.name}-${i}`}>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.overdue && <span className="text-xs text-tg-destructive">overdue</span>}
              <StatusChip status={s.status} />
            </Row>
          ))}
        </Section>
      ))}
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
