"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner, Flags, StatusChip, statusLabel } from "@/app/app/_components/status";
import { Button, Loading, Notice, Section } from "@/app/app/_components/ui";
import { apiFetch, confirmDialog, type ApiResult } from "@/app/app/_lib/telegram";
import type { AssignmentDetailResponse } from "@/app/app/_lib/types";

const ORDER = ["BLOCKED", "ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION", "COMPLETED"];
const inputClass = "w-full rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-tg-text";

// /app/assignments/:id: every student's status + flags. Subject teacher: select → [Checked in class]
// [Nudge selected]; [Change due date] and [Cancel assignment] (same domain functions as chat).
export function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [data, setData] = useState<ApiResult<AssignmentDetailResponse> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState<{ dueDate: string; dueTime: string } | null>(null);

  const load = useCallback(() => apiFetch<AssignmentDetailResponse>(`/api/app/assignments/${assignmentId}`).then(setData), [assignmentId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const a = data.data;
  const base = `/api/app/assignments/${a.id}`;

  async function call(path: string, body: unknown) {
    setBusy(true);
    const r = await apiFetch<{ message?: string; preview?: string }>(path, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    return r;
  }
  async function bulk(path: string) {
    const r = await call(`${base}/${path}`, { saIds: [...selected] });
    setNotice(r.ok ? { text: r.data.message ?? "Done.", tone: "info" } : { text: r.message, tone: "error" });
    setSelected(new Set());
    await load();
  }
  async function checkedInClass() {
    if (await confirmDialog(`Mark ${selected.size} student${selected.size === 1 ? "" : "s"} as completed (checked in class)? They'll be told.`)) {
      await bulk("checked-in-class");
    }
  }
  async function changeDue() {
    if (!changing) return;
    const body = { ...changing, expectedVersion: a.version };
    const preview = await call(`${base}/change`, { ...body, mode: "preview" });
    if (!preview.ok) return setNotice({ text: preview.message, tone: "error" });
    if (!(await confirmDialog(`${preview.data.preview}\nStudents will be told and asked to acknowledge again.`))) return;
    const r = await call(`${base}/change`, { ...body, mode: "apply" });
    setNotice(r.ok ? { text: r.data.message ?? "Updated.", tone: "info" } : { text: r.message, tone: "error" });
    if (r.ok) setChanging(null);
    await load();
  }
  async function cancel() {
    if (!(await confirmDialog(`Cancel ${a.subject} · ${a.title} (${a.className})? Students who have it will be told there's nothing to submit.`))) return;
    const r = await call(`${base}/cancel`, {});
    setNotice(r.ok ? { text: r.data.message ?? "Cancelled.", tone: "info" } : { text: r.message, tone: "error" });
    await load();
  }
  const toggle = (saId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(saId)) next.delete(saId);
      else next.add(saId);
      return next;
    });

  return (
    <>
      <BackNav />
      <p className="text-sm text-tg-hint">
        {a.subject} · {a.className}
        {a.version > 1 ? ` · version ${a.version}` : ""}
      </p>
      <h1 className="text-xl font-semibold">{a.title}</h1>
      <p className="mb-3 text-sm">
        Due {a.dueLabel}
        {a.status === "CANCELLED" && <span className="ml-2 font-medium text-tg-destructive">Cancelled</span>}
      </p>
      {!a.statusOnly && a.instructions && <p className="mb-1 whitespace-pre-wrap text-sm">{a.instructions}</p>}
      {a.notes && <p className="mb-3 text-sm text-tg-hint">⚠ Note: {a.notes}</p>}

      <div className="mb-4 mt-3 flex flex-wrap gap-1.5">
        {ORDER.filter((s) => a.counts[s]).map((s) => (
          <span key={s} className="rounded-full bg-tg-secondary-bg px-3 py-1 text-xs">
            {statusLabel(s)} <b>{a.counts[s]}</b>
          </span>
        ))}
      </div>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {a.canManage && selected.size > 0 && (
        <div className="sticky top-0 z-10 -mx-4 mb-3 flex gap-2 bg-tg-bg px-4 py-2">
          <Button onClick={checkedInClass} disabled={busy}>
            Checked in class ({selected.size})
          </Button>
          <Button variant="secondary" onClick={() => bulk("nudge")} disabled={busy}>
            Nudge selected
          </Button>
        </div>
      )}

      <Section title={`Students (${a.students.length})`}>
        {a.students.map((s) => (
          <div key={s.saId} className="flex items-center gap-3 border-b border-tg-hint/15 px-4 py-3 last:border-b-0">
            {a.canManage && (
              <input
                type="checkbox"
                aria-label={`Select ${s.name}`}
                className="h-5 w-5 shrink-0 accent-[var(--tg-theme-button-color,#2481cc)]"
                checked={selected.has(s.saId)}
                onChange={() => toggle(s.saId)}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.name}</p>
              <Flags flags={s.flags} />
              {!a.statusOnly && (
                <div className="mt-1 flex gap-3 text-sm">
                  {s.hasSubmission && (
                    <Link href={`/app/review/${s.saId}`} className="text-tg-link">
                      {a.canManage ? "Review" : "Submissions"}
                    </Link>
                  )}
                  {(s.status === "BLOCKED" || s.flags.includes("unanswered_question")) && (
                    <Link href={`/app/doubts/${s.saId}`} className="text-tg-link">
                      Doubt
                    </Link>
                  )}
                </div>
              )}
            </div>
            <StatusChip status={s.status} />
          </div>
        ))}
      </Section>

      {a.canManage && (
        <Section title="Manage">
          <div className="space-y-3 px-4 py-3">
            {changing ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className={inputClass} value={changing.dueDate} onChange={(e) => setChanging({ ...changing, dueDate: e.target.value })} />
                  <input type="time" className={inputClass} value={changing.dueTime} onChange={(e) => setChanging({ ...changing, dueTime: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={changeDue} disabled={busy}>
                    Preview change
                  </Button>
                  <Button variant="secondary" onClick={() => setChanging(null)}>
                    Back
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setChanging({ dueDate: a.dueDate, dueTime: a.dueTime })}>
                  Change due date
                </Button>
                <Button variant="danger" onClick={cancel} disabled={busy}>
                  Cancel assignment
                </Button>
              </div>
            )}
          </div>
        </Section>
      )}
      {!a.canManage && !a.statusOnly && a.status === "PUBLISHED" && <p className="text-sm text-tg-hint">Read-only: you&apos;re the class teacher, not the subject teacher.</p>}
    </>
  );
}
