"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner, StatusChip } from "@/app/app/_components/status";
import { FeedbackList, SubmissionList } from "@/app/app/_components/submissions";
import { Button, Loading, Notice, Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { ReviewResponse } from "@/app/app/_lib/types";

// /app/review/:saId: submission history with previews, feedback history, and the feedback box.
export function ReviewScreen() {
  const { saId } = useParams<{ saId: string }>();
  const [data, setData] = useState<ApiResult<ReviewResponse> | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const load = useCallback(() => apiFetch<ReviewResponse>(`/api/app/review/${saId}`).then(setData), [saId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const r = data.data;

  async function send(result: "COMPLETED" | "NEEDS_REVISION") {
    setBusy(true);
    const res = await apiFetch<{ message: string }>(`/api/app/review/${saId}`, { method: "POST", body: JSON.stringify({ result, comment }) });
    setBusy(false);
    setNotice(res.ok ? { text: res.data.message, tone: "success" } : { text: res.message, tone: "error" });
    if (res.ok) setComment("");
    await load();
  }

  return (
    <>
      <BackNav />
      <Link href={`/app/assignments/${r.assignmentId}`} className="block text-sm text-tg-link">
        {r.assignment}
      </Link>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold">
          {r.studentName} ({r.className})
        </h1>
        <StatusChip status={r.status} />
      </div>
      <p className="mb-4 text-sm text-tg-hint">Due {r.dueLabel}</p>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {r.submissions.length === 0 ? <p className="py-6 text-center text-tg-hint">Nothing submitted yet.</p> : <SubmissionList submissions={r.submissions} />}

      {r.canReview && (
        <Section title="Your feedback">
          <div className="space-y-2 px-4 py-3">
            <textarea
              className="w-full rounded-lg border border-tg-hint/30 bg-field px-3 py-2 text-tg-text"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Well done! / Redo q5: show your working."
              maxLength={1000}
            />
            <div className="flex gap-2">
              <Button onClick={() => send("COMPLETED")} disabled={busy}>
                ✓ Completed
              </Button>
              <Button variant="danger" onClick={() => send("NEEDS_REVISION")} disabled={busy || !comment.trim()}>
                Needs revision
              </Button>
            </div>
          </div>
        </Section>
      )}

      <FeedbackList feedback={r.feedback} />
    </>
  );
}
