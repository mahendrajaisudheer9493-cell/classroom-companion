"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MyWork } from "@/app/app/_components/my-work";
import { Banner } from "@/app/app/_components/status";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { BellRing, CircleCheckBig, Plus } from "lucide-react";
import { Button, Card, CountTile, SectionHeader, Skeleton, TRIAGE_GROUP } from "@/components/ui";
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
      <SectionHeader title="Today" action={<Link href="/app/triage" className="text-tg-link">Open triage ›</Link>} />
      {!triage ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      ) : !c ? (
        <Card className="mb-4 text-tg-hint">Couldn&apos;t load the triage board.</Card>
      ) : total === 0 ? (
        <Card tone="completed" className="mb-4 flex items-center gap-3">
          <CircleCheckBig aria-hidden size={22} />
          <span className="text-headline font-semibold">All clear: nobody needs you right now</span>
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["stuck", "silent", "overdue", "toReview"] as const).map((k) => (
            <CountTile key={k} count={c[k]} meta={TRIAGE_GROUP[k]} href="/app/triage" />
          ))}
        </div>
      )}

      <div className="mb-2 grid grid-cols-2 gap-2">
        <Button href="/app/assignments/new" icon={Plus}>
          New assignment
        </Button>
        <Button variant="secondary" icon={BellRing} onClick={runReminders} loading={running}>
          Run reminders now
        </Button>
      </div>
      <div className="mb-4 text-center">
        <Button variant="plain" size="sm" onClick={sendDigest} disabled={running}>
          Send my digest now (demo)
        </Button>
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
    <Link href={`/app/school?schoolId=${schoolId}`} className="mb-6 block rounded-xl bg-surface px-4 py-4 active:opacity-70">
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
