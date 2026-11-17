"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner, StatusChip } from "@/app/app/_components/status";
import { FeedbackList, SubmissionList } from "@/app/app/_components/submissions";
import { Button, Loading, Notice, Section } from "@/app/app/_components/ui";
import { apiFetch, confirmDialog, waitForWebApp, type ApiResult } from "@/app/app/_lib/telegram";
import type { WorkDetailResponse } from "@/app/app/_lib/types";

const MAX_BYTES = 4 * 1024 * 1024;

// /app/work/:saId: one assignment. For the student: latest instructions, what changed + [Got it],
// [I'm stuck], submit (type, bring to class, upload), submissions, feedback, doubt thread.
export function WorkDetail() {
  const { saId } = useParams<{ saId: string }>();
  const [work, setWork] = useState<ApiResult<WorkDetailResponse> | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"none" | "type">("none");
  const [answer, setAnswer] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => apiFetch<WorkDetailResponse>(`/api/app/work/${saId}`).then(setWork), [saId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!work) return <Loading />;
  if (!work.ok) return <Notice error={work.error} message={work.message} />;
  const w = work.data;

  async function post(path: string, body?: unknown) {
    setBusy(true);
    const r = await apiFetch<{ message: string }>(`/api/app/work/${saId}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    setNotice(r.ok ? { text: r.data.message, tone: "success" } : { text: r.message, tone: "error" });
    if (r.ok) {
      setMode("none");
      setAnswer("");
    }
    await load();
  }

  async function upload(file: File) {
    if (file.size > MAX_BYTES) return setNotice({ text: "That file is over 4 MB. Send it in the chat instead.", tone: "error" });
    setBusy(true);
    const webApp = await waitForWebApp();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/app/work/${saId}/submit`, {
      method: "POST",
      body: form,
      headers: webApp?.initData ? { Authorization: `tma ${webApp.initData}` } : {},
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    setNotice(res?.ok ? { text: body.message, tone: "success" } : { text: body.message ?? "Upload failed. Try again.", tone: "error" });
    await load();
  }

  return (
    <>
      <BackNav />
      <p className="text-sm text-tg-hint">
        {w.subject} · {w.className}
        {!w.isOwner && ` · ${w.studentName}`}
      </p>
      <div className="mb-1 flex items-start gap-2">
        <h1 className="flex-1 text-xl font-semibold">{w.title}</h1>
        <StatusChip status={w.status} />
      </div>
      <p className="mb-4 text-sm">Due {w.dueLabel}</p>

      {w.cancelled && <Banner>This assignment was cancelled. Nothing to submit.</Banner>}
      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {w.changeNote && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-amber-500/15 px-4 py-3">
          <p className="flex-1 text-sm font-medium">{w.changeNote}</p>
          <Button onClick={() => post("ack")} disabled={busy}>
            Got it
          </Button>
        </div>
      )}

      {w.instructions !== undefined && (
        <Section title="Instructions">
          <div className="space-y-2 px-4 py-3">
            <p className="whitespace-pre-wrap">{w.instructions}</p>
            {w.notes && <p className="text-sm text-tg-hint">Note: {w.notes}</p>}
          </div>
        </Section>
      )}

      {w.canAct && (
        <Section title={w.status === "NEEDS_REVISION" ? "Resubmit" : w.status === "SUBMITTED" ? "Submit again" : "Hand in"}>
          <div className="space-y-3 px-4 py-3">
            {mode === "type" ? (
              <>
                <textarea
                  className="w-full rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-tg-text"
                  rows={5}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer…"
                  maxLength={4000}
                />
                <div className="flex gap-2">
                  <Button onClick={() => post("submit", { kind: "TEXT", text: answer })} disabled={busy || !answer.trim()}>
                    Submit answer
                  </Button>
                  <Button variant="secondary" onClick={() => setMode("none")}>
                    Back
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => fileInput.current?.click()} disabled={busy}>
                  📷 Photo / file
                </Button>
                <Button variant="secondary" onClick={() => setMode("type")} disabled={busy}>
                  ✏️ Type answer
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (await confirmDialog(`Mark ${w.subject} · ${w.title} as submitted (bringing it to class)?`)) await post("submit", { kind: "IN_CLASS" });
                  }}
                  disabled={busy}
                >
                  📒 Bringing it to class
                </Button>
                {w.status !== "BLOCKED" && w.status !== "SUBMITTED" && (
                  <Button variant="danger" onClick={() => post("stuck")} disabled={busy}>
                    🆘 I&apos;m stuck
                  </Button>
                )}
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
            />
            {busy && <p className="text-sm text-tg-hint">Working…</p>}
          </div>
        </Section>
      )}

      {w.level === "full" && (
        <Link href={`/app/doubts/${saId}`} className="mb-6 flex min-h-11 items-center justify-between rounded-xl bg-tg-secondary-bg px-4 active:opacity-70">
          <span className="font-medium">{w.isOwner ? "Ask your teacher" : "Doubt thread"}</span>
          <span className="text-sm text-tg-hint">
            {w.doubtCount ? `${w.doubtCount} message${w.doubtCount === 1 ? "" : "s"}` : ""} ›
          </span>
        </Link>
      )}

      <SubmissionList submissions={w.submissions} title={w.isOwner ? "My submissions" : "Submissions"} />
      <FeedbackList feedback={w.feedback} />
    </>
  );
}
