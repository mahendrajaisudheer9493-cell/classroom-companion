"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner } from "@/app/app/_components/status";
import { Button, Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { apiFetch, confirmDialog, shareInTelegram, type ApiResult } from "@/app/app/_lib/telegram";
import type { InviteDto, SchoolSetupResponse } from "@/app/app/_lib/types";

// /app/school/setup (C1): classes + rosters, class teacher per class, teachers and their roles,
// teacher invites. Everything is checked on the server against the coordinator's own school.

const input = "w-full rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-tg-text";

type Grant = { classId: string; role: "SUBJECT_TEACHER" | "CLASS_TEACHER"; subject: string };

export function SchoolSetup() {
  const schoolIdParam = useSearchParams().get("schoolId");
  const [data, setData] = useState<ApiResult<SchoolSetupResponse> | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => apiFetch<SchoolSetupResponse>(`/api/app/school/setup${schoolIdParam ? `?schoolId=${schoolIdParam}` : ""}`).then(setData),
    [schoolIdParam],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const d = data.data;

  async function run<T extends { message?: string }>(call: () => Promise<ApiResult<T>>, success?: string): Promise<T | null> {
    setBusy(true);
    const r = await call();
    setBusy(false);
    setNotice(r.ok ? { text: success ?? r.data.message ?? "Done.", tone: "success" } : { text: r.message, tone: "error" });
    await load();
    return r.ok ? r.data : null;
  }
  const post = <T extends { message?: string } = { message?: string }>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  return (
    <>
      <BackNav fallbackHref="/app/school" />
      <h1 className="text-xl font-semibold">School setup</h1>
      <p className="mb-4 text-sm text-tg-hint">{d.school.name}</p>
      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      <ClassesSection
        data={d}
        busy={busy}
        onSetClassTeacher={(classId, userId) => run(() => post(`/api/app/school/classes/${classId}/class-teacher`, { userId }))}
        onCreate={(body) => run(() => post<{ message: string }>("/api/app/school/classes", { schoolId: d.school.id, ...body }))}
      />

      <InviteSection
        data={d}
        busy={busy}
        onCreate={(grants) =>
          run(() => post<InviteDto & { message?: string }>("/api/app/school/invites", { schoolId: d.school.id, grants }), "Invite created. Send the link to the teacher.")
        }
      />

      <Section title={`Teachers (${d.teachers.length})`}>
        {d.teachers.map((t) => (
          <div key={t.userId} className="border-b border-tg-hint/15 px-4 py-3 last:border-b-0">
            <p className="font-medium">
              {t.name}
              {t.username ? <span className="text-sm font-normal text-tg-hint"> @{t.username}</span> : null}
              {t.isYou ? <span className="text-sm font-normal text-tg-hint"> (you)</span> : null}
            </p>
            <ul className="mt-1 space-y-1">
              {t.memberships.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">{m.label}</span>
                  {!(t.isYou && m.role === "COORDINATOR") && (
                    <button
                      type="button"
                      disabled={busy}
                      className="text-tg-destructive active:opacity-70 disabled:opacity-50"
                      onClick={async () => {
                        if (await confirmDialog(`Remove "${m.label}" from ${t.name}? They lose access to it straight away.`)) {
                          await run(() => post(`/api/app/school/memberships/${m.id}/remove`));
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
    </>
  );
}

function ClassesSection({
  data,
  busy,
  onSetClassTeacher,
  onCreate,
}: {
  data: SchoolSetupResponse;
  busy: boolean;
  onSetClassTeacher: (classId: string, userId: string) => void;
  onCreate: (body: { name: string; grade: number; roster: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("8");
  const [roster, setRoster] = useState("");
  const count = roster.split("\n").filter((l) => l.trim()).length;

  return (
    <Section title={`Classes (${data.classes.length})`}>
      {data.classes.map((c) => (
        <div key={c.id} className="space-y-2 border-b border-tg-hint/15 px-4 py-3">
          <p className="font-medium">
            {c.name} <span className="text-sm font-normal text-tg-hint">· grade {c.grade} · linked {c.linked}/{c.total}</span>
          </p>
          {c.link && <p className="break-all font-mono text-xs text-tg-hint">{c.link.url}</p>}
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-tg-hint">Class teacher</span>
            <select
              className={input}
              value={c.classTeacher?.userId ?? ""}
              disabled={busy}
              onChange={(e) => e.target.value && onSetClassTeacher(c.id, e.target.value)}
            >
              {!c.classTeacher && <option value="">— none —</option>}
              {data.teachers.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
      <form
        className="space-y-2 px-4 py-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onCreate({ name, grade: Number(grade), roster })) {
            setName("");
            setRoster("");
          }
        }}
      >
        <p className="font-medium">+ New class</p>
        <div className="flex gap-2">
          <input className={input} placeholder="Name, e.g. 8C" value={name} onChange={(e) => setName(e.target.value)} required maxLength={20} />
          <input className={`${input} w-24`} type="number" min={1} max={12} value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade" />
        </div>
        <textarea
          className={`${input} min-h-28`}
          placeholder={"Paste the roster, one name per line\nRoll numbers follow this order"}
          value={roster}
          onChange={(e) => setRoster(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-tg-hint">{count} student{count === 1 ? "" : "s"} · a class link is created automatically</span>
          <button type="submit" disabled={busy || !name.trim()} className="min-h-10 rounded-lg bg-tg-button px-3.5 text-sm font-medium text-tg-button-text disabled:opacity-50">
            Create class
          </button>
        </div>
      </form>
    </Section>
  );
}

function InviteSection({
  data,
  busy,
  onCreate,
}: {
  data: SchoolSetupResponse;
  busy: boolean;
  onCreate: (grants: { classId: string; role: Grant["role"]; subject: string | null }[]) => Promise<(InviteDto & { message?: string }) | null>;
}) {
  const firstClass = data.classes[0]?.id ?? "";
  const [grants, setGrants] = useState<Grant[]>([{ classId: firstClass, role: "SUBJECT_TEACHER", subject: "" }]);
  const [created, setCreated] = useState<InviteDto | null>(null);
  const update = (i: number, patch: Partial<Grant>) => setGrants((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* the link is shown on screen anyway */
    }
  }

  return (
    <Section title="Invite a teacher">
      <div className="space-y-3 px-4 py-3">
        {grants.map((g, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <select className={input} value={g.classId} onChange={(e) => update(i, { classId: e.target.value })} aria-label="Class">
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className={input} value={g.role} onChange={(e) => update(i, { role: e.target.value as Grant["role"] })} aria-label="Role">
              <option value="SUBJECT_TEACHER">Subject teacher</option>
              <option value="CLASS_TEACHER">Class teacher</option>
            </select>
            {g.role === "SUBJECT_TEACHER" && (
              <input className={`${input} col-span-2`} placeholder="Subject, e.g. Science" value={g.subject} onChange={(e) => update(i, { subject: e.target.value })} />
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setGrants((gs) => [...gs, { classId: firstClass, role: "SUBJECT_TEACHER", subject: "" }])}>
            + Another class / role
          </Button>
          {grants.length > 1 && (
            <Button variant="secondary" onClick={() => setGrants((gs) => gs.slice(0, -1))}>
              Remove last
            </Button>
          )}
          <Button
            disabled={busy || !firstClass}
            onClick={async () => {
              const r = await onCreate(grants.map((g) => ({ classId: g.classId, role: g.role, subject: g.role === "SUBJECT_TEACHER" ? g.subject : null })));
              if (r) setCreated(r);
            }}
          >
            Create invite
          </Button>
        </div>

        {created && (
          <div className="space-y-2 rounded-lg border border-tg-hint/25 p-3">
            <p className="text-sm">{created.grants.join(" · ")}</p>
            <p className="break-all font-mono text-sm">{created.url}</p>
            <p className="text-xs text-tg-hint">One use · valid 7 days</p>
            <div className="flex gap-2">
              <Button onClick={() => copy(created.url)}>Copy</Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!(await shareInTelegram(created.url, `Join ${data.school.name} on Classroom Companion`))) copy(created.url);
                }}
              >
                Share
              </Button>
            </div>
          </div>
        )}
      </div>
      {data.invites.length > 0 && (
        <div className="border-t border-tg-hint/15">
          <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-tg-hint">Unused invites</p>
          {data.invites.map((i) => (
            <Row key={i.code}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{i.code}</p>
                <p className="truncate text-xs text-tg-hint">{i.grants.join(" · ")}</p>
              </div>
              <Button variant="secondary" onClick={() => copy(i.url)}>
                Copy
              </Button>
            </Row>
          ))}
        </div>
      )}
    </Section>
  );
}
