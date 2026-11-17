"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { WorkResponse } from "@/app/app/_lib/types";

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "New",
  ACKNOWLEDGED: "Got it",
  IN_PROGRESS: "In progress",
  BLOCKED: "Stuck",
  SUBMITTED: "Submitted",
  NEEDS_REVISION: "Needs revision",
  COMPLETED: "Completed",
};

// /app/work/:saId: one assignment for one student (read-only for now; Task 5 adds actions).
export function WorkDetail() {
  const { saId } = useParams<{ saId: string }>();
  const [work, setWork] = useState<ApiResult<WorkResponse> | null>(null);

  useEffect(() => {
    apiFetch<WorkResponse>(`/api/app/work/${saId}`).then(setWork);
  }, [saId]);

  if (!work) return <Loading />;
  if (!work.ok) return <Notice error={work.error} message={work.message} />;
  const w = work.data;

  return (
    <>
      <Link href="/app" className="mb-3 inline-block text-sm text-tg-link">
        ‹ Home
      </Link>
      <p className="text-sm text-tg-hint">
        {w.subject} · {w.className}
      </p>
      <h1 className="mb-1 text-xl font-semibold">{w.title}</h1>
      <p className="mb-5 text-sm">Due {w.dueLabel}</p>

      {w.cancelled && (
        <p className="mb-4 rounded-lg bg-tg-secondary-bg px-4 py-2 text-sm">This assignment was cancelled. Nothing to submit.</p>
      )}
      {!w.cancelled && !w.seenLatest && w.status !== "ASSIGNED" && (
        <p className="mb-4 rounded-lg bg-tg-secondary-bg px-4 py-2 text-sm">
          This assignment was updated. Tap Got it on the update in chat.
        </p>
      )}

      {w.instructions !== undefined && (
        <Section title="Instructions">
          <div className="space-y-2 px-4 py-3">
            <p className="whitespace-pre-wrap">{w.instructions}</p>
            {w.notes && <p className="text-sm text-tg-hint">Note: {w.notes}</p>}
          </div>
        </Section>
      )}

      <Section title="Status">
        <Row>
          <span className="flex-1">{w.studentName}</span>
          <span className="rounded-full bg-tg-bg px-3 py-1 text-sm">{STATUS_LABEL[w.status] ?? w.status}</span>
        </Row>
      </Section>
    </>
  );
}
