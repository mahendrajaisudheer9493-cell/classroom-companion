"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HealthLine, WorstBadge } from "@/app/app/_components/health";
import { BackNav } from "@/app/app/_components/nav";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
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
      <h1 className="text-xl font-semibold">School health</h1>
      <p className="mb-4 text-sm text-tg-hint">{school.name}</p>

      <p className="mb-4 rounded-lg bg-tg-secondary-bg px-4 py-2.5 text-sm">
        {worst ? (
          <>
            ⚠ <b>{worst.name}</b> is falling behind: {worst.stats.overduePct ?? 0}% overdue, {worst.stats.stuck} stuck.
          </>
        ) : (
          "No class is falling behind ✓"
        )}
      </p>

      <Section title={`Classes (${classes.length})`}>
        {classes.map((c) => (
          <Link key={c.id} href={`/app/school/classes/${c.id}`} className="block active:opacity-70">
            <Row>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {c.name} <span className="text-sm font-normal text-tg-hint">· linked {c.linked}/{c.total}</span>
                </p>
                <HealthLine stats={c.stats} />
              </div>
              {c.id === worstClassId && <WorstBadge />}
              <span className="text-tg-hint">›</span>
            </Row>
          </Link>
        ))}
      </Section>

      <Link
        href={`/app/school/setup${schoolId ? `?schoolId=${schoolId}` : ""}`}
        className="flex min-h-11 items-center justify-center rounded-xl border border-tg-hint/25 px-3 font-medium text-tg-link active:opacity-70"
      >
        School setup: classes, teachers, invites ›
      </Link>
      <p className="mt-3 text-xs text-tg-hint">% seen = delivered work the student has acted on in its latest version. % overdue = past due and not handed in.</p>
    </>
  );
}
