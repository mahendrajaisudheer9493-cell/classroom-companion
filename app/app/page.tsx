"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MyWork } from "@/app/app/_components/my-work";
import { Banner } from "@/app/app/_components/status";
import { Button, Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { DigestResponse, MeResponse, SchoolHealthResponse, TickResponse, TriageResponse } from "@/app/app/_lib/types";

// /app: role-aware home. One section per role the person has.
export default function HomePage() {
  const [me, setMe] = useState<ApiResult<MeResponse> | null>(null);
  useEffect(() => {
    apiFetch<MeResponse>("/api/app/me").then(setMe);
  }, []);

  if (!me) return <Loading />;
  if (!me.ok) return <Notice error={me.error} message={me.message} />;
  const { displayName, student, classes, coordinatorOf } = me.data;
  const teachesSubjects = classes.some((c) => c.subjects.length > 0);

  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Hi, {student && !teachesSubjects ? student.name : displayName}</h1>

      {teachesSubjects && <TeacherToday />}

      {classes.length > 0 && (
        <Section title="My classes">
          {classes.map((c) => (
            <Link key={c.id} href={`/app/classes/${c.id}`} className="block active:opacity-70">
              <Row>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="truncate text-sm text-tg-hint">
                    {[...c.subjects, ...(c.isClassTeacher ? ["Class teacher"] : [])].join(" · ")}
                  </p>
                </div>
                <span className="text-sm text-tg-hint">
                  linked {c.linked} / {c.total}
                </span>
                <span className="text-tg-hint">›</span>
              </Row>
            </Link>
          ))}
        </Section>
      )}

      {student && <MyWork />}

      {coordinatorOf.map((s) => (
        <SchoolHealthCard key={s.schoolId} schoolId={s.schoolId} schoolName={s.schoolName} />
      ))}
    </>
  );
}

/** Triage summary, [+ New assignment] and [Run reminders now] for subject teachers. */
function TeacherToday() {
  const [triage, setTriage] = useState<ApiResult<TriageResponse> | null>(null);
  const [tick, setTick] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    apiFetch<TriageResponse>("/api/app/triage").then(setTriage);
  }, []);

  async function runReminders() {
    setRunning(true);
    const r = await apiFetch<TickResponse>("/api/app/tick", { method: "POST" });
    setRunning(false);
    if (!r.ok) return setTick(r.message);
    if ("skipped" in r.data) return setTick("Reminders are already running. Try again in a minute.");
    setTick(r.data.message);
  }

  async function sendDigest() {
    setRunning(true);
    const r = await apiFetch<DigestResponse>("/api/app/digest", { method: "POST" });
    setRunning(false);
    setTick(r.ok ? r.data.message : r.message);
  }

  const c = triage?.ok ? triage.data.counts : null;
  const total = c ? c.stuck + c.silent + c.overdue + c.toReview : 0;
  return (
    <>
      <Link href="/app/triage" className="mb-4 block rounded-xl bg-tg-secondary-bg px-4 py-4 active:opacity-70">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tg-hint">Today</p>
        {!triage ? (
          <p className="text-tg-hint">Loading…</p>
        ) : !c ? (
          <p className="text-tg-hint">Couldn&apos;t load the triage board.</p>
        ) : total === 0 ? (
          <p className="text-lg font-semibold">All clear ✓</p>
        ) : (
          <p className="text-lg font-semibold">
            {c.stuck} stuck · {c.silent} silent · {c.overdue} overdue · {c.toReview} to review
          </p>
        )}
        <p className="mt-1 text-sm text-tg-link">Open triage board ›</p>
      </Link>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link href="/app/assignments/new" className="flex min-h-11 items-center justify-center rounded-xl bg-tg-button px-3 font-medium text-tg-button-text active:opacity-70">
          + New assignment
        </Link>
        <Button variant="secondary" onClick={runReminders} disabled={running}>
          {running ? "Running…" : "Run reminders now"}
        </Button>
      </div>
      <div className="mb-3 text-right">
        <button type="button" onClick={sendDigest} disabled={running} className="text-sm text-tg-link active:opacity-70 disabled:opacity-50">
          Send my digest now (demo)
        </button>
      </div>
      {tick && <Banner>{tick}</Banner>}
      <div className="mb-3" />
    </>
  );
}

/** Coordinator: the worst class at a glance; opens /app/school. */
function SchoolHealthCard({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [health, setHealth] = useState<ApiResult<SchoolHealthResponse> | null>(null);
  useEffect(() => {
    apiFetch<SchoolHealthResponse>(`/api/app/school?schoolId=${schoolId}`).then(setHealth);
  }, [schoolId]);
  const worst = health?.ok ? health.data.classes.find((c) => c.id === health.data.worstClassId) : undefined;
  return (
    <Link href={`/app/school?schoolId=${schoolId}`} className="mb-6 block rounded-xl bg-tg-secondary-bg px-4 py-4 active:opacity-70">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tg-hint">School health · {schoolName}</p>
      {!health ? (
        <p className="text-tg-hint">Loading…</p>
      ) : !health.ok ? (
        <p className="text-tg-hint">Couldn&apos;t load school health.</p>
      ) : worst ? (
        <p className="text-lg font-semibold">
          ⚠ {worst.name} is falling behind: {worst.stats.overduePct ?? 0}% overdue · {worst.stats.stuck} stuck
        </p>
      ) : (
        <p className="text-lg font-semibold">No class is falling behind ✓</p>
      )}
      <p className="mt-1 text-sm text-tg-link">Open school health ›</p>
    </Link>
  );
}
