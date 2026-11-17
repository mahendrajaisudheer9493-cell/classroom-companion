"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { HealthLine, WorstBadge } from "@/app/app/_components/health";
import { BackNav } from "@/app/app/_components/nav";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
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
      <h1 className="text-xl font-semibold">{d.class.name}</h1>
      <p className="mb-1 text-sm text-tg-hint">
        {d.school.name} · linked {d.class.linked}/{d.class.total}
      </p>
      <div className="mb-5">
        <HealthLine stats={d.stats} />
      </div>
      <Section title="By subject">
        {d.subjects.length === 0 && <p className="px-4 py-3 text-sm text-tg-hint">No published assignments yet.</p>}
        {d.subjects.map((s) => (
          <Link key={s.subject} href={`/app/school/classes/${d.class.id}/subjects/${encodeURIComponent(s.subject)}`} className="block active:opacity-70">
            <Row>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.subject}</p>
                <HealthLine stats={s.stats} />
              </div>
              {s.subject === d.worstSubject && <WorstBadge />}
              <span className="text-tg-hint">›</span>
            </Row>
          </Link>
        ))}
      </Section>
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
