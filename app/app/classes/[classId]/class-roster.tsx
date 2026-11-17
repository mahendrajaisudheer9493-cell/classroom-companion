"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Button, Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { apiFetch, confirmDialog, shareInTelegram, type ApiResult } from "@/app/app/_lib/telegram";
import type { ClassLink, RosterResponse } from "@/app/app/_lib/types";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// /app/classes/:classId: roster (linked or not), class link, regenerate code, unlink.
export function ClassRoster() {
  const { classId } = useParams<{ classId: string }>();
  const [roster, setRoster] = useState<ApiResult<RosterResponse> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => apiFetch<RosterResponse>(`/api/app/classes/${classId}`).then(setRoster), [classId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!roster) return <Loading />;
  if (!roster.ok) return <Notice error={roster.error} message={roster.message} />;
  const { class: klass, link, students, linked, total } = roster.data;

  async function run(action: () => Promise<ApiResult<unknown>>, success: string) {
    setBusy(true);
    const result = await action();
    setNotice(result.ok ? success : result.message);
    await load();
    setBusy(false);
  }

  async function regenerate() {
    const ok = await confirmDialog(
      `Create a new class link for ${klass.name}? The old link stops working. Students already linked stay linked.`,
    );
    if (ok) await run(() => apiFetch<{ link: ClassLink }>(`/api/app/classes/${classId}/code`, { method: "POST" }), "New class link created.");
  }

  async function unlink(student: RosterResponse["students"][number]) {
    const ok = await confirmDialog(
      `Unlink ${student.name}${student.linkedAs ? ` from ${student.linkedAs}` : ""}? They can then join again with the class link.`,
    );
    if (ok)
      await run(
        () => apiFetch(`/api/app/classes/${classId}/students/${student.id}/unlink`, { method: "POST" }),
        `${student.name} is unlinked.`,
      );
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch {
      setNotice(`Copy this link: ${url}`);
    }
  }

  return (
    <>
      <BackNav />
      <h1 className="text-xl font-semibold">{klass.name}</h1>
      <p className="mb-5 text-sm text-tg-hint">
        {klass.schoolName} · linked {linked} / {total}
      </p>

      {notice && <p className="mb-4 rounded-lg bg-tg-secondary-bg px-4 py-2 text-sm">{notice}</p>}

      <Section title="Class link">
        <div className="space-y-3 px-4 py-3">
          {link ? (
            <>
              <p className="break-all font-mono text-sm">{link.url}</p>
              <p className="text-xs text-tg-hint">
                Code {link.code} · valid until {formatDate(link.expiresAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => copy(link.url)}>Copy link</Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!(await shareInTelegram(link.url, `Join ${klass.name} on Classroom Companion`))) copy(link.url);
                  }}
                >
                  Share
                </Button>
                <Button variant="secondary" onClick={regenerate} disabled={busy}>
                  Regenerate code
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-tg-hint">This class has no active link.</p>
              <Button onClick={regenerate} disabled={busy}>
                Create class link
              </Button>
            </>
          )}
        </div>
      </Section>

      <Section title={`Students (${total})`}>
        {students.map((s) => (
          <Row key={s.id}>
            <span className="w-6 text-sm text-tg-hint">{s.rollNo}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.name}</p>
              <p className="truncate text-xs text-tg-hint">
                {s.linked ? `Linked${s.linkedAs ? ` · ${s.linkedAs}` : ""}` : "Not linked yet"}
              </p>
            </div>
            {s.linked && (
              <Button variant="danger" onClick={() => unlink(s)} disabled={busy}>
                Unlink
              </Button>
            )}
          </Row>
        ))}
      </Section>
    </>
  );
}
