"use client";

import { CalendarClock, CircleCheckBig, Inbox, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner } from "@/app/app/_components/status";
import { FeedbackList, SubmissionList } from "@/app/app/_components/submissions";
import { Loading, Notice } from "@/app/app/_components/ui";
import { apiFetch, haptic, type ApiResult } from "@/app/app/_lib/telegram";
import type { ReviewResponse } from "@/app/app/_lib/types";
import { Avatar, Button, Card, EmptyState, List, StatusChip } from "@/components/ui";

// /app/review/:saId: the latest work large (tap for full screen), history, and the feedback box
// with two big buttons: Completed (green) and Needs revision (orange, needs a comment).
export function ReviewScreen() {
  const { saId } = useParams<{ saId: string }>();
  const [data, setData] = useState<ApiResult<ReviewResponse> | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"COMPLETED" | "NEEDS_REVISION" | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const load = useCallback(() => apiFetch<ReviewResponse>(`/api/app/review/${saId}`).then(setData), [saId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const r = data.data;

  async function send(result: "COMPLETED" | "NEEDS_REVISION") {
    setBusy(result);
    const res = await apiFetch<{ message: string }>(`/api/app/review/${saId}`, { method: "POST", body: JSON.stringify({ result, comment }) });
    setBusy(null);
    if (res.ok) haptic.success();
    else haptic.error();
    setNotice(res.ok ? { text: res.data.message, tone: "success" } : { text: res.message, tone: "error" });
    if (res.ok) setComment("");
    await load();
  }

  return (
    <>
      <BackNav />
      <Card className="mb-4 flex items-center gap-3">
        <Avatar name={r.studentName} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-headline font-bold">
            {r.studentName} <span className="font-normal text-tg-hint">({r.className})</span>
          </h1>
          <Link href={`/app/assignments/${r.assignmentId}`} className="block truncate text-caption text-tg-link">
            {r.assignment}
          </Link>
          <p className="flex items-center gap-1 text-caption text-tg-hint">
            <CalendarClock aria-hidden size={13} /> Due {r.dueLabel}
          </p>
        </div>
        <StatusChip status={r.status} size="sm" />
      </Card>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {r.submissions.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing submitted yet" />
      ) : (
        <SubmissionList submissions={r.submissions} title="Submitted work" />
      )}

      {r.canReview && (
        <List title="Your feedback" footer={'"Needs revision" needs a comment, so the student knows what to redo.'}>
          <div className="space-y-3 p-4">
            <textarea
              className="w-full rounded-xl border border-[var(--color-separator)] bg-field px-3 py-2 text-body text-tg-text"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Well done! / Redo q5: show your working."
              aria-label="Feedback comment"
              maxLength={1000}
            />
            <div className="grid grid-cols-1 gap-2">
              <Button size="lg" variant="solid" tone="completed" icon={CircleCheckBig} onClick={() => send("COMPLETED")} loading={busy === "COMPLETED"} disabled={busy !== null}>
                Completed
              </Button>
              <Button
                size="lg"
                variant="solid"
                tone="revision"
                icon={RotateCcw}
                onClick={() => send("NEEDS_REVISION")}
                loading={busy === "NEEDS_REVISION"}
                disabled={busy !== null || !comment.trim()}
              >
                Needs revision
              </Button>
            </div>
          </div>
        </List>
      )}

      <FeedbackList feedback={r.feedback} />
    </>
  );
}
