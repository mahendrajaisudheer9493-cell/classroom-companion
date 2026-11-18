"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { RosterPaste, rosterCount } from "@/app/app/_components/roster-paste";
import { Avatar } from "@/components/ui/avatar";
import { ClassLoad, ClassStruggling, Tabs, type ClassTab } from "@/app/app/classes/[classId]/class-tabs";
import { Button, Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { apiFetch, confirmDialog, shareInTelegram, type ApiResult } from "@/app/app/_lib/telegram";
import type { ClassLink, RosterResponse } from "@/app/app/_lib/types";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// /app/classes/:classId: roster (linked or not), class link, regenerate code, unlink.
// The class teacher also gets Load (all subjects by due date) and Struggling (2+ subjects) tabs.
export function ClassRoster() {
  const { classId } = useParams<{ classId: string }>();
  const [roster, setRoster] = useState<ApiResult<RosterResponse> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<ClassTab>("roster");
  const [newNames, setNewNames] = useState("");

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

  async function addStudents() {
    setBusy(true);
    const r = await apiFetch<{ message: string }>(`/api/app/classes/${classId}/students`, { method: "POST", body: JSON.stringify({ roster: newNames }) });
    setNotice(r.ok ? r.data.message : r.message);
    if (r.ok) setNewNames("");
    await load();
    setBusy(false);
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

      {roster.data.isClassTeacher && <Tabs tab={tab} onChange={setTab} />}
      {tab === "load" && <ClassLoad classId={classId} />}
      {tab === "struggling" && <ClassStruggling classId={classId} />}
      {tab === "roster" && (
        <>
          {notice && <p className="mb-4 rounded-lg bg-surface px-4 py-2 text-sm">{notice}</p>}

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

          <Section title={`Students · ${linked} of ${total} on Telegram`}>
            {students.map((s) => (
              <Row key={s.id}>
                <Avatar name={s.name} />
                <Link href={`/app/students/${s.id}`} className="min-w-0 flex-1 active:opacity-70">
                  <p className="truncate text-body font-medium">{s.name}</p>
                  <p className="truncate text-caption text-tg-hint">
                    Roll {s.rollNo} · {s.linked ? `on Telegram${s.linkedAs ? ` as ${s.linkedAs}` : ""}` : "not on Telegram yet"}
                  </p>
                </Link>
                {s.linked && (
                  <Button variant="danger" onClick={() => unlink(s)} disabled={busy}>
                    Unlink
                  </Button>
                )}
              </Row>
            ))}
          </Section>

          <Section title="Add students">
            <div className="space-y-2 px-4 py-3">
              <RosterPaste value={newNames} onChange={setNewNames} label="New names get the next roll numbers" />
              <Button onClick={addStudents} disabled={busy || rosterCount(newNames) === 0}>
                Add {rosterCount(newNames) || ""} student{rosterCount(newNames) === 1 ? "" : "s"}
              </Button>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
