"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Ban, Bell, CalendarClock, CircleCheckBig, History, Inbox, MessageCircle, StickyNote, X } from "lucide-react";
import { Banner, Flags, StatusChip, timeAgo } from "@/app/app/_components/status";
import { Loading, Notice } from "@/app/app/_components/ui";
import { Avatar, Button as BaseButton, Card, Chip, List, ListRow, StatusBar } from "@/components/ui";
import { apiFetch, confirmDialog, type ApiResult } from "@/app/app/_lib/telegram";
import type { AssignmentDetailResponse } from "@/app/app/_lib/types";

const REMINDER_LABEL: Record<string, string> = {
  silent: "did you see it?",
  due_soon: "due soon",
  blocked_checkin: "still stuck?",
  overdue: "was due",
};
const inputClass = "w-full rounded-xl border border-[var(--color-separator)] bg-field px-3 py-2 text-tg-text";

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
      <Card className="mb-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="text-caption font-medium text-tg-hint">
            {a.subject} · {a.className}
          </span>
          {a.version > 1 && (
            <Chip tone="silent" icon={History} size="sm">
              Changed (version {a.version})
            </Chip>
          )}
          {a.status === "CANCELLED" && (
            <Chip tone="danger" icon={Ban} size="sm">
              Cancelled
            </Chip>
          )}
        </div>
        <h1 className="text-title font-bold leading-tight">{a.title}</h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-body">
          <CalendarClock aria-hidden size={16} className="text-tg-hint" />
          Due {a.dueLabel}
        </p>
        {!a.statusOnly && a.instructions && <p className="mt-3 whitespace-pre-wrap text-body text-tg-text">{a.instructions}</p>}
        {a.notes && (
          <p className="tinted tone-silent mt-3 flex gap-2 rounded-xl px-3 py-2 text-caption font-medium">
            <StickyNote aria-hidden size={16} className="mt-px shrink-0" />
            <span>Note: {a.notes}</span>
          </p>
        )}
      </Card>

      <Card className="mb-6">
        <p className="mb-2 text-caption font-medium uppercase tracking-wide text-tg-section-header">
          {a.students.length} student{a.students.length === 1 ? "" : "s"}
        </p>
        <StatusBar counts={a.counts} />
      </Card>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      <List
        title={`Students · ${a.students.length}`}
        action={
          a.canManage &&
          a.students.length > 0 && (
            <button type="button" className="font-medium text-tg-link" onClick={() => setSelected(selected.size === a.students.length ? new Set() : new Set(a.students.map((s) => s.saId)))}>
              {selected.size === a.students.length ? "Clear" : "Select all"}
            </button>
          )
        }
      >
        {a.students.map((s) => (
          <ListRow
            key={s.saId}
            leading={
              a.canManage ? (
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.name}`}
                    className="h-5 w-5 shrink-0 accent-[var(--color-tg-button)]"
                    checked={selected.has(s.saId)}
                    onChange={() => toggle(s.saId)}
                  />
                  <Avatar name={s.name} />
                </label>
              ) : (
                <Avatar name={s.name} />
              )
            }
            title={s.name}
            subtitle={
              s.lastReminder ? `Reminder "${REMINDER_LABEL[s.lastReminder.kind] ?? s.lastReminder.kind}" · ${timeAgo(s.lastReminder.at)}` : undefined
            }
            detail={<StatusChip status={s.status} size="sm" />}
          >
            {(s.flags.length > 0 || (!a.statusOnly && (s.hasSubmission || s.status === "BLOCKED" || s.flags.includes("unanswered_question")))) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Flags flags={s.flags} />
                {!a.statusOnly && s.hasSubmission && (
                  <BaseButton size="pill" variant="tonal" tone="review" icon={Inbox} href={`/app/review/${s.saId}`}>
                    {a.canManage ? "Review" : "Submissions"}
                  </BaseButton>
                )}
                {!a.statusOnly && (s.status === "BLOCKED" || s.flags.includes("unanswered_question")) && (
                  <BaseButton size="pill" variant="tonal" tone="accent" icon={MessageCircle} href={`/app/doubts/${s.saId}`}>
                    Doubt
                  </BaseButton>
                )}
              </div>
            )}
          </ListRow>
        ))}
      </List>

      {a.canManage && (
        <List title="Manage">
          <div className="space-y-3 px-4 py-3">
            {changing ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" aria-label="New due date" className={inputClass} value={changing.dueDate} onChange={(e) => setChanging({ ...changing, dueDate: e.target.value })} />
                  <input type="time" aria-label="New due time" className={inputClass} value={changing.dueTime} onChange={(e) => setChanging({ ...changing, dueTime: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <BaseButton size="sm" onClick={changeDue} disabled={busy}>
                    Preview change
                  </BaseButton>
                  <BaseButton size="sm" variant="secondary" onClick={() => setChanging(null)}>
                    Back
                  </BaseButton>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <BaseButton size="sm" variant="secondary" icon={CalendarClock} onClick={() => setChanging({ dueDate: a.dueDate, dueTime: a.dueTime })}>
                  Change due date
                </BaseButton>
                <BaseButton size="sm" variant="destructive" icon={Ban} onClick={cancel} disabled={busy}>
                  Cancel assignment
                </BaseButton>
              </div>
            )}
          </div>
        </List>
      )}
      {!a.canManage && !a.statusOnly && a.status === "PUBLISHED" && (
        <p className="px-4 text-caption text-tg-hint">Read-only: you&apos;re the class teacher, not the subject teacher.</p>
      )}

      {a.canManage && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-separator)] bg-surface pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-[480px] items-center gap-2 px-4">
            <button type="button" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-tg-hint">
              <X size={20} aria-hidden />
            </button>
            <span className="min-w-0 flex-1 text-body font-semibold">{selected.size} selected</span>
            <BaseButton size="sm" variant="tonal" tone="accent" icon={Bell} onClick={() => bulk("nudge")} disabled={busy}>
              Nudge
            </BaseButton>
            <BaseButton size="sm" variant="solid" tone="completed" icon={CircleCheckBig} onClick={checkedInClass} disabled={busy}>
              Checked in class
            </BaseButton>
          </div>
        </div>
      )}
    </>
  );
}
