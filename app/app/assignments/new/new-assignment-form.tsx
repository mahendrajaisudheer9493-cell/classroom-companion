"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Button, Loading, Notice, Section } from "@/app/app/_components/ui";
import { Banner } from "@/app/app/_components/status";
import { apiFetch, haptic, type ApiResult } from "@/app/app/_lib/telegram";
import { useMainButton } from "@/components/ui/main-button";
import type { AssignmentFormResponse, CreateAssignmentBody, CreateAssignmentResponse } from "@/app/app/_lib/types";

const inputClass = "w-full rounded-lg border border-tg-hint/30 bg-field px-3 py-2 text-tg-text";

/** Tomorrow's date in IST as YYYY-MM-DD (for the date input default). */
const tomorrowIst = () => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block px-4 py-3">
      <span className="mb-1 block text-xs font-medium text-tg-hint">{label}</span>
      {children}
    </label>
  );
}

// /app/assignments/new: the no-LLM fallback ("Create in app") and "Edit in app" for a chat draft.
export function NewAssignmentForm() {
  const draftId = useSearchParams().get("draft");
  const [form, setForm] = useState<ApiResult<AssignmentFormResponse> | null>(null);
  const [values, setValues] = useState({ slot: "", title: "", instructions: "", notes: "", dueDate: tomorrowIst(), dueTime: "08:00" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AssignmentFormResponse>(`/api/app/assignments/form${draftId ? `?draft=${draftId}` : ""}`).then((res) => {
      setForm(res);
      if (!res.ok) return;
      const d = res.data.draft;
      const first = res.data.options[0];
      setValues((v) =>
        d
          ? { slot: `${d.classId}|${d.subject}`, title: d.title, instructions: d.instructions, notes: d.notes ?? "", dueDate: d.dueDate, dueTime: d.dueTime }
          : { ...v, slot: first ? `${first.classId}|${first.subject}` : "" },
      );
    });
  }, [draftId]);

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value });

  async function submit() {
    const [classId, subject] = values.slot.split("|");
    const body: CreateAssignmentBody = {
      draftId: form?.ok ? form.data.draft?.id : undefined,
      classId,
      subject,
      title: values.title,
      instructions: values.instructions,
      notes: values.notes || undefined,
      dueDate: values.dueDate,
      dueTime: values.dueTime,
    };
    setBusy(true);
    setError(null);
    const res = await apiFetch<CreateAssignmentResponse>("/api/app/assignments", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) {
      haptic.success();
      setDone(res.data.message);
    } else {
      haptic.error();
      setError(res.message);
    }
  }

  const canSend = !!form?.ok && !busy && !!values.slot && !!values.title.trim();
  // Telegram's MainButton is the main action; outside Telegram the normal button below is shown.
  const nativeMain = useMainButton({ text: "Send to students", onClick: submit, disabled: !canSend, loading: busy, visible: !!form?.ok && !done });

  if (!form) return <Loading />;
  if (!form.ok) return <Notice error={form.error} message={form.message} />;

  if (done) {
    return (
      <div className="py-6">
        <h1 className="mb-3 text-xl font-semibold">Sent ✓</h1>
        <p className="mb-5 text-tg-hint">{done}</p>
        <Link href="/app" className="text-tg-link">
          ‹ Back to home
        </Link>
      </div>
    );
  }

  return (
    <>
      <BackNav />
      <h1 className="mb-5 text-xl font-semibold">{form.data.draft ? "Edit and send" : "New assignment"}</h1>

      <Section title="Assignment">
        <Field label="Class and subject">
          <select className={inputClass} value={values.slot} onChange={set("slot")}>
            {form.data.options.map((o) => (
              <option key={`${o.classId}|${o.subject}`} value={`${o.classId}|${o.subject}`}>
                {o.className} · {o.subject}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className={inputClass} value={values.title} onChange={set("title")} placeholder="Exercise 4.2, q1–q8" maxLength={120} />
        </Field>
        <Field label="Instructions">
          <textarea className={inputClass} rows={3} value={values.instructions} onChange={set("instructions")} placeholder="What should students do?" />
        </Field>
        <Field label="Note (optional)">
          <input className={inputClass} value={values.notes} onChange={set("notes")} placeholder="Skip q8 if you did the extra sheet" />
        </Field>
      </Section>

      <Section title="Due (IST)">
        <div className="grid grid-cols-2">
          <Field label="Date">
            <input type="date" className={inputClass} value={values.dueDate} onChange={set("dueDate")} />
          </Field>
          <Field label="Time">
            <input type="time" className={inputClass} value={values.dueTime} onChange={set("dueTime")} />
          </Field>
        </div>
      </Section>

      {error && <Banner tone="error">{error}</Banner>}
      {!nativeMain && (
        <Button onClick={submit} disabled={!canSend}>
          {busy ? "Sending…" : "Send to students"}
        </Button>
      )}
    </>
  );
}
