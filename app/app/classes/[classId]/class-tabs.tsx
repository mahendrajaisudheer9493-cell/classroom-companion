"use client";

import { CalendarCheck, CircleCheckBig, TriangleExclamationPoint } from "lucide-react";
import { useEffect, useState } from "react";
import { Loading, Notice } from "@/app/app/_components/ui";
import { Chip, EmptyState, List, ListRow, SectionHeader, SegmentedTabs } from "@/components/ui";
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
  if (days.length === 0) return <EmptyState icon={CalendarCheck} tone="completed" title="Nothing due from today on" />;
  return (
    <>
      <p className="mb-4 px-1 text-caption text-tg-hint">Every subject&apos;s work by due date. Days with 3 or more are flagged.</p>
      {days.map((d) => (
        <section key={d.date} className={`mb-6 ${d.heavy ? "tone-overdue" : ""}`}>
          <SectionHeader
            title={`${d.label} · ${d.items.length} due`}
            action={
              d.heavy && (
                <Chip tone="overdue" icon={TriangleExclamationPoint} size="sm">
                  Heavy day
                </Chip>
              )
            }
          />
          <div className={`overflow-hidden rounded-2xl bg-surface ${d.heavy ? "shadow-[inset_3px_0_0_var(--tone)]" : ""}`}>
            {d.items.map((i) => (
              <ListRow key={i.id} avatar={i.subject} title={i.title} subtitle={i.subject} detail={i.dueLabel.split(", ")[1]} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

const PROBLEM_TONE = { stuck: "stuck", silent: "silent", overdue: "overdue" } as const;

/** CT2: stuck / silent / overdue in 2 or more subjects. */
export function ClassStruggling({ classId }: { classId: string }) {
  const [data, setData] = useState<ApiResult<ClassStrugglingResponse> | null>(null);
  useEffect(() => {
    apiFetch<ClassStrugglingResponse>(`/api/app/classes/${classId}/struggling`).then(setData);
  }, [classId]);
  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const { students } = data.data;
  if (students.length === 0) {
    return <EmptyState icon={CircleCheckBig} tone="completed" title="Nobody is struggling in 2 or more subjects" />;
  }
  return (
    <>
      <p className="mb-4 px-1 text-caption text-tg-hint">Students who are stuck, silent or overdue in 2 or more subjects. Tap a name for all their work.</p>
      <List title={`Struggling · ${students.length}`}>
        {students.map((s) => (
          <ListRow key={s.studentId} href={`/app/students/${s.studentId}`} avatar={s.name} title={s.name} subtitle={`${s.subjects.length} subjects`}>
            <div className="flex flex-wrap gap-1">
              {s.subjects.flatMap((sub) =>
                sub.problems.map((p) => (
                  <Chip key={`${sub.subject}-${p}`} tone={PROBLEM_TONE[p]} size="sm">
                    {sub.subject}: {p}
                  </Chip>
                )),
              )}
            </div>
          </ListRow>
        ))}
      </List>
    </>
  );
}
