"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { StatusChip } from "@/app/app/_components/status";
import { FeedbackList, SubmissionList } from "@/app/app/_components/submissions";
import { Loading, Notice } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { StudentWorkResponse } from "@/app/app/_lib/types";

// /app/students/:id: one student's work across subjects, read-only. The server decides the scope:
// class teacher → every subject; subject teacher → only their own subjects; anyone else → 403.
export function StudentWork() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<ApiResult<StudentWorkResponse> | null>(null);
  useEffect(() => {
    apiFetch<StudentWorkResponse>(`/api/app/students/${studentId}`).then(setData);
  }, [studentId]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const { student, allSubjects, items } = data.data;

  return (
    <>
      <BackNav />
      <h1 className="text-xl font-semibold">{student.name}</h1>
      <p className="mb-1 text-sm text-tg-hint">
        {student.className} · roll {student.rollNo} · {student.linked ? "on Telegram" : "not on Telegram yet"}
      </p>
      <p className="mb-5 text-xs text-tg-hint">Read-only{allSubjects ? " · all subjects" : " · your subjects only"}</p>

      {items.length === 0 && <p className="py-6 text-center text-tg-hint">No assignments yet.</p>}
      {items.map((i) => (
        <details key={i.saId} className="mb-3 overflow-hidden rounded-xl bg-tg-secondary-bg">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {i.subject} · {i.title}
              </p>
              <p className={`text-xs ${i.overdue ? "text-tg-destructive" : "text-tg-hint"}`}>
                Due {i.dueLabel}
                {i.overdue ? " · overdue" : ""}
                {i.submissions.length ? ` · ${i.submissions.length} submission${i.submissions.length === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <StatusChip status={i.status} />
          </summary>
          <div className="bg-tg-bg px-2 pt-3">
            {i.submissions.length === 0 && i.feedback.length === 0 && <p className="px-2 pb-3 text-sm text-tg-hint">Nothing handed in yet.</p>}
            <SubmissionList submissions={i.submissions} />
            <FeedbackList feedback={i.feedback} />
          </div>
        </details>
      ))}
    </>
  );
}
