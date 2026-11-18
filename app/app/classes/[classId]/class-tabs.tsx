"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { ClassLoadResponse, ClassStrugglingResponse } from "@/app/app/_lib/types";

// Class teacher tabs on /app/classes/:id. Read-only; the server checks canViewClassFull.

export type ClassTab = "roster" | "load" | "struggling";

export function Tabs({ tab, onChange }: { tab: ClassTab; onChange: (t: ClassTab) => void }) {
  return (
    <SegmentedTabs
      value={tab}
      onChange={onChange}
      options={[
        { value: "roster", label: "Roster" },
        { value: "load", label: "Load" },
        { value: "struggling", label: "Struggling" },
      ]}
    />
  );
}

/** CT1: every subject's work by due date; 3+ on one day flagged. */
export function ClassLoad({ classId }: { classId: string }) {
  const [data, setData] = useState<ApiResult<ClassLoadResponse> | null>(null);
  useEffect(() => {
    apiFetch<ClassLoadResponse>(`/api/app/classes/${classId}/load`).then(setData);
  }, [classId]);
  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const { days } = data.data;
  if (days.length === 0) return <p className="py-6 text-center text-tg-hint">Nothing due from today on.</p>;
  return (
    <>
      <p className="mb-3 text-sm text-tg-hint">All subjects, by due date. Days with 3 or more are flagged.</p>
      {days.map((d) => (
        <Section key={d.date} title={`${d.label} · ${d.items.length} due${d.heavy ? " · ⚠ Heavy day" : ""}`}>
          {d.items.map((i) => (
            <Row key={i.id}>
              <span className="w-20 shrink-0 text-sm font-medium">{i.subject}</span>
              <span className="min-w-0 flex-1 truncate">{i.title}</span>
              <span className="shrink-0 text-xs text-tg-hint">{i.dueLabel.split(", ")[1]}</span>
            </Row>
          ))}
        </Section>
      ))}
    </>
  );
}

/** CT2: stuck / silent / overdue in 2 or more subjects. */
export function ClassStruggling({ classId }: { classId: string }) {
  const [data, setData] = useState<ApiResult<ClassStrugglingResponse> | null>(null);
  useEffect(() => {
    apiFetch<ClassStrugglingResponse>(`/api/app/classes/${classId}/struggling`).then(setData);
  }, [classId]);
  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const { students } = data.data;
  return (
    <>
      <p className="mb-3 text-sm text-tg-hint">Students who are stuck, silent or overdue in 2 or more subjects.</p>
      {students.length === 0 ? (
        <p className="py-6 text-center text-tg-hint">Nobody is struggling in 2+ subjects ✓</p>
      ) : (
        <Section title={`Struggling (${students.length})`}>
          {students.map((s) => (
            <Link key={s.studentId} href={`/app/students/${s.studentId}`} className="block active:opacity-70">
              <Row>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-tg-hint">{s.summary}</p>
                </div>
                <span className="text-tg-hint">›</span>
              </Row>
            </Link>
          ))}
        </Section>
      )}
    </>
  );
}
