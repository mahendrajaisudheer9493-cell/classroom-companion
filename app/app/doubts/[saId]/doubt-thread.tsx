"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner, StatusChip } from "@/app/app/_components/status";
import { Button, Loading, Notice } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { DoubtThreadDto } from "@/app/app/_lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// /app/doubts/:saId: the private thread between one student and the subject teacher.
// Teacher: reply (quiet hours apply) + [Mark resolved]. Student: send another message.
export function DoubtThread() {
  const { saId } = useParams<{ saId: string }>();
  const [thread, setThread] = useState<ApiResult<DoubtThreadDto> | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);

  const load = useCallback(() => apiFetch<DoubtThreadDto>(`/api/app/doubts/${saId}`).then(setThread), [saId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!thread) return <Loading />;
  if (!thread.ok) return <Notice error={thread.error} message={thread.message} />;
  const t = thread.data;
  const canWrite = t.canReply || t.isOwner;

  async function post(path: string, body?: unknown) {
    setBusy(true);
    const r = await apiFetch<{ message: string }>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    setNotice(r.ok ? { text: r.data.message, tone: "info" } : { text: r.message, tone: "error" });
    if (r.ok) setText("");
    await load();
  }

  return (
    <>
      <BackNav />
      <Link href={t.isOwner ? `/app/work/${saId}` : `/app/assignments/${t.assignmentId}`} className="block text-sm text-tg-link">
        {t.assignment}
      </Link>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold">
          {t.isOwner ? "Ask your teacher" : `${t.studentName} (${t.className})`}
        </h1>
        <StatusChip status={t.status} />
      </div>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      <div className="mb-4 space-y-2">
        {t.messages.length === 0 && <p className="py-6 text-center text-sm text-tg-hint">No messages yet.</p>}
        {t.messages.map((m) => {
          const mine = t.isOwner ? m.from === "STUDENT" : m.from === "TEACHER";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${mine ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary-bg"}`}>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={`mt-0.5 text-[11px] ${mine ? "opacity-80" : "text-tg-hint"}`}>
                  {m.author} · {when(m.at)}
                  {m.deliverAt && ` · will be delivered at ${when(m.deliverAt)}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {canWrite && (
        <div className="sticky bottom-0 -mx-4 bg-tg-bg px-4 pb-4 pt-2">
          <textarea
            className="mb-2 w-full rounded-xl border border-tg-hint/30 bg-tg-bg px-3 py-2 text-tg-text"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.isOwner ? "What are you stuck on?" : `Reply to ${t.studentName}…`}
            maxLength={2000}
          />
          <div className="flex gap-2">
            <Button onClick={() => post(`/api/app/doubts/${saId}/message`, { text })} disabled={busy || !text.trim()}>
              {busy ? "Sending…" : t.isOwner ? "Send to teacher" : "Send reply"}
            </Button>
            {t.canResolve && (
              <Button variant="secondary" onClick={() => post(`/api/app/doubts/${saId}/resolve`)} disabled={busy}>
                Mark resolved
              </Button>
            )}
          </div>
        </div>
      )}
      {!canWrite && <p className="text-sm text-tg-hint">Read-only.</p>}
    </>
  );
}
