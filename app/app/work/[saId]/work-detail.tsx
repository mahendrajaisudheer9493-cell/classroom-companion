"use client";

import { CalendarClock, Camera, LifeBuoy, MessageCircle, NotebookPen, StickyNote, Type } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner } from "@/app/app/_components/status";
import { FeedbackList, SubmissionList } from "@/app/app/_components/submissions";
import { Loading, Notice } from "@/app/app/_components/ui";
import { Button as BaseButton, Card, List, ListRow, StatusChip, Stepper } from "@/components/ui";
import { apiFetch, confirmDialog, haptic, waitForWebApp, type ApiResult } from "@/app/app/_lib/telegram";
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
    if (r.ok) haptic.success();
    else haptic.error();
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
      <Card className="mb-4">
        <div className="mb-1 flex items-start gap-2">
          <p className="flex-1 text-caption font-medium text-tg-hint">
            {w.subject} · {w.className}
            {!w.isOwner && ` · ${w.studentName}`}
          </p>
          <StatusChip status={w.status} size="sm" />
        </div>
        <h1 className="text-title font-bold leading-tight">{w.title}</h1>
        <p className="mb-4 mt-1.5 flex items-center gap-1.5 text-body">
          <CalendarClock aria-hidden size={16} className="text-tg-hint" />
          Due {w.dueLabel}
        </p>
        {!w.cancelled && <Stepper status={w.status} />}
      </Card>

      {w.cancelled && <Banner tone="error">This assignment was cancelled. Nothing to submit.</Banner>}
      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {w.changeNote && (
        <div className="tinted tone-silent mb-4 flex items-center gap-3 rounded-2xl px-4 py-3">
          <CalendarClock aria-hidden size={20} className="shrink-0" />
          <p className="flex-1 text-body font-semibold">{w.changeNote}</p>
          <BaseButton size="sm" variant="solid" tone="silent" onClick={() => post("ack")} disabled={busy}>
            Got it
          </BaseButton>
        </div>
      )}

      {w.instructions !== undefined && (
        <List title="Instructions">
          <div className="space-y-3 px-4 py-3">
            <p className="whitespace-pre-wrap text-body">{w.instructions}</p>
            {w.notes && (
              <p className="tinted tone-silent flex gap-2 rounded-xl px-3 py-2 text-caption font-medium">
                <StickyNote aria-hidden size={16} className="mt-px shrink-0" />
                <span>Note: {w.notes}</span>
              </p>
            )}
          </div>
        </List>
      )}

      {w.canAct && (
        <List title={w.status === "NEEDS_REVISION" ? "Hand in again" : w.status === "SUBMITTED" ? "Submit again" : "Hand in"}>
          <div className="space-y-3 p-4">
            {mode === "type" ? (
              <>
                <textarea
                  className="w-full rounded-xl border border-[var(--color-separator)] bg-field px-3 py-2 text-body text-tg-text"
                  rows={5}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer…"
                  aria-label="Your answer"
                  maxLength={4000}
                />
                <div className="grid grid-cols-2 gap-2">
                  <BaseButton onClick={() => post("submit", { kind: "TEXT", text: answer })} disabled={busy || !answer.trim()} loading={busy}>
                    Submit answer
                  </BaseButton>
                  <BaseButton variant="secondary" onClick={() => setMode("none")}>
                    Back
                  </BaseButton>
                </div>
              </>
            ) : (
              <>
                <BaseButton block icon={Camera} onClick={() => fileInput.current?.click()} disabled={busy} loading={busy}>
                  Send a photo or file
                </BaseButton>
                <div className="grid grid-cols-2 gap-2">
                  <BaseButton size="sm" variant="secondary" icon={Type} onClick={() => setMode("type")} disabled={busy}>
                    Type answer
                  </BaseButton>
                  <BaseButton
                    size="sm"
                    variant="secondary"
                    icon={NotebookPen}
                    onClick={async () => {
                      if (await confirmDialog(`Mark ${w.subject} · ${w.title} as submitted (bringing it to class)?`)) await post("submit", { kind: "IN_CLASS" });
                    }}
                    disabled={busy}
                  >
                    Bring to class
                  </BaseButton>
                </div>
                {w.status !== "BLOCKED" && w.status !== "SUBMITTED" && (
                  <BaseButton block size="sm" variant="tonal" tone="stuck" icon={LifeBuoy} onClick={() => post("stuck")} disabled={busy}>
                    I&apos;m stuck
                  </BaseButton>
                )}
              </>
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
            <p className="text-caption text-tg-hint">Photos and files up to 4 MB. Bigger ones: send them in the chat.</p>
          </div>
        </List>
      )}

      {w.level === "full" && (
        <List>
          <ListRow
            href={`/app/doubts/${saId}`}
            leading={
              <span className="tinted tone-accent flex h-9 w-9 items-center justify-center rounded-full">
                <MessageCircle aria-hidden size={18} />
              </span>
            }
            title={w.isOwner ? "Ask your teacher" : "Doubt thread"}
            detail={w.doubtCount ? `${w.doubtCount} message${w.doubtCount === 1 ? "" : "s"}` : undefined}
          />
        </List>
      )}

      <SubmissionList submissions={w.submissions} title={w.isOwner ? "My submissions" : "Submissions"} />
      <FeedbackList feedback={w.feedback} />
    </>
  );
}
