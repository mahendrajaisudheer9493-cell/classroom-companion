"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { AssignmentOverviewResponse } from "@/app/app/_lib/types";

const ORDER = ["BLOCKED", "ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION", "COMPLETED"];
const LABEL: Record<string, string> = {
  ASSIGNED: "Not seen yet",
  ACKNOWLEDGED: "Got it",
  IN_PROGRESS: "In progress",
  BLOCKED: "Stuck",
  SUBMITTED: "Submitted",
  NEEDS_REVISION: "Needs revision",
  COMPLETED: "Completed",
};

// /app/assignments/:assignmentId: counts per status for now; the per-student list arrives in Task 5.
export function AssignmentOverview() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [data, setData] = useState<ApiResult<AssignmentOverviewResponse> | null>(null);
  useEffect(() => {
    apiFetch<AssignmentOverviewResponse>(`/api/app/assignments/${assignmentId}`).then(setData);
  }, [assignmentId]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const a = data.data;
  return (
    <>
      <Link href="/app" className="mb-3 inline-block text-sm text-tg-link">
        ‹ Home
      </Link>
      <p className="text-sm text-tg-hint">{a.className}</p>
      <h1 className="mb-1 text-xl font-semibold">{a.assignment}</h1>
      <p className="mb-5 text-sm">
        Due {a.dueLabel}
        {a.status === "CANCELLED" ? " · Cancelled" : ""}
      </p>
      <Section title={`Students (${a.total})`}>
        {ORDER.filter((s) => a.counts[s]).map((s) => (
          <Row key={s}>
            <span className="flex-1">{LABEL[s]}</span>
            <span className="font-medium">{a.counts[s]}</span>
          </Row>
        ))}
      </Section>
      <p className="text-sm text-tg-hint">Each student&apos;s status and actions are coming soon.</p>
    </>
  );
}
