"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { BackNav } from "@/app/app/_components/nav";
import { Avatar, Card, Chip } from "@/components/ui";
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
      <Card className="mb-5 flex items-center gap-3">
        <Avatar name={student.name} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title font-bold">{student.name}</h1>
          <p className="text-caption text-tg-hint">
            {student.className} · roll {student.rollNo} · {student.linked ? "on Telegram" : "not on Telegram yet"}
          </p>
        </div>
        <Chip tone="neutral" icon={Eye} size="sm">
          {allSubjects ? "All subjects" : "Your subjects"}
        </Chip>
      </Card>

      {items.length === 0 && <p className="py-6 text-center text-tg-hint">No assignments yet.</p>}
      {items.map((i) => (
        <details key={i.saId} className={`mb-3 overflow-hidden rounded-2xl bg-surface ${i.overdue ? "tone-overdue shadow-[inset_3px_0_0_var(--tone)]" : ""}`}>
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">
                {i.subject} · {i.title}
              </p>
              <p className={`text-caption ${i.overdue ? "tone-overdue text-tone font-medium" : "text-tg-hint"}`}>
                Due {i.dueLabel}
                {i.overdue ? " · overdue" : ""}
                {i.submissions.length ? ` · ${i.submissions.length} submission${i.submissions.length === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <StatusChip status={i.status} size="sm" />
          </summary>
          <div className="bg-field px-2 pt-3">
            {i.submissions.length === 0 && i.feedback.length === 0 && <p className="px-2 pb-3 text-sm text-tg-hint">Nothing handed in yet.</p>}
            <SubmissionList submissions={i.submissions} />
            <FeedbackList feedback={i.feedback} />
          </div>
        </details>
      ))}
    </>
  );
}
