"use client";

import { BellRing, CircleCheckBig, Mail, Plus, School, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MyWork } from "@/app/app/_components/my-work";
import { Banner } from "@/app/app/_components/status";
import { Loading, Notice } from "@/app/app/_components/ui";
import { apiFetch, haptic, type ApiResult } from "@/app/app/_lib/telegram";
import type { DigestResponse, MeResponse, SchoolHealthResponse, TickResponse, TriageResponse } from "@/app/app/_lib/types";
import { Button, Card, CountTile, List, ListRow, ProgressBar, SectionHeader, Skeleton, TRIAGE_GROUP } from "@/components/ui";

/** "Good morning" by the hour in IST. */
function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
const todayLabel = () => new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
/** "Mrs. Lakshmi Rao" → "Lakshmi"; "Ravi Kumar" → "Ravi". */
const firstName = (name: string) => name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/)[0] ?? name;

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
  const name = student && !teachesSubjects ? student.name : displayName;

  return (
    <>
      <header className="mb-5 px-1">
        <p className="text-caption font-medium text-tg-hint">{todayLabel()}</p>
        <h1 className="text-large font-bold">
          {greeting()}, {firstName(name)}
        </h1>
        {student && !teachesSubjects && (
          <p className="text-body text-tg-hint">
            {student.className} · {student.schoolName}
          </p>
        )}
      </header>

      {teachesSubjects && <TeacherToday />}

      {classes.length > 0 && (
        <List title="My classes">
          {classes.map((c) => (
            <ListRow
              key={c.id}
              href={`/app/classes/${c.id}`}
              avatar={c.name}
              title={c.name}
              subtitle={[...c.subjects, ...(c.isClassTeacher ? ["Class teacher"] : [])].join(" · ")}
            >
              <ProgressBar
                value={c.linked}
                max={c.total}
                tone={c.total > 0 && c.linked === c.total ? "completed" : "accent"}
                label={
                  <>
                    <span>On Telegram</span>
                    <span className="tabular-nums">
                      {c.linked} / {c.total}
                    </span>
                  </>
                }
              />
            </ListRow>
          ))}
        </List>
      )}

      {student && <MyWork />}

      {coordinatorOf.map((s) => (
        <SchoolHealthCard key={s.schoolId} schoolId={s.schoolId} schoolName={s.schoolName} />
      ))}
    </>
  );
}

/** Today's counts as tiles (each opens the board filtered), quick actions, reminder results. */
function TeacherToday() {
  const [triage, setTriage] = useState<ApiResult<TriageResponse> | null>(null);
  const [result, setResult] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [running, setRunning] = useState<"tick" | "digest" | null>(null);
  useEffect(() => {
    apiFetch<TriageResponse>("/api/app/triage").then(setTriage);
  }, []);

  async function runReminders() {
    setRunning("tick");
    const r = await apiFetch<TickResponse>("/api/app/tick", { method: "POST" });
    setRunning(null);
    if (!r.ok) return setResult({ text: r.message, tone: "error" });
    haptic.success();
    if ("skipped" in r.data) return setResult({ text: "Reminders are already running. Try again in a minute.", tone: "info" });
    setResult({ text: r.data.message, tone: "info" });
  }

  async function sendDigest() {
    setRunning("digest");
    const r = await apiFetch<DigestResponse>("/api/app/digest", { method: "POST" });
    setRunning(null);
    if (r.ok) haptic.success();
    setResult(r.ok ? { text: r.data.message, tone: "info" } : { text: r.message, tone: "error" });
  }

  const c = triage?.ok ? triage.data.counts : null;
  const total = c ? c.stuck + c.silent + c.overdue + c.toReview : 0;
  return (
    <>
      <SectionHeader
        title="Today"
        action={
          <Link href="/app/triage" className="font-medium text-tg-link">
            Triage board
          </Link>
        }
      />
      {!triage ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      ) : !c ? (
        <Card className="mb-4 text-tg-hint">Couldn&apos;t load today&apos;s numbers.</Card>
      ) : total === 0 ? (
        <Card tone="completed" className="mb-4 flex items-center gap-3">
          <CircleCheckBig aria-hidden size={22} />
          <span className="text-headline font-semibold">All clear. Nobody needs you right now.</span>
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["stuck", "silent", "overdue", "toReview"] as const).map((k) => (
            <CountTile key={k} count={c[k]} meta={TRIAGE_GROUP[k]} href={`/app/triage?group=${k}`} />
          ))}
        </div>
      )}

      <div className="mb-2">
        <Button href="/app/assignments/new" icon={Plus} block>
          New assignment
        </Button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" icon={BellRing} onClick={runReminders} loading={running === "tick"} disabled={running !== null}>
          Run reminders now
        </Button>
        <Button variant="secondary" size="sm" icon={Mail} onClick={sendDigest} loading={running === "digest"} disabled={running !== null}>
          Send digest
        </Button>
      </div>
      {result && <Banner tone={result.tone}>{result.text}</Banner>}
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
    <List title="School health">
      {!health ? (
        <div className="p-4">
          <Skeleton className="h-10" />
        </div>
      ) : !health.ok ? (
        <ListRow title="Couldn't load school health" subtitle={health.message} />
      ) : (
        <ListRow
          href={`/app/school?schoolId=${schoolId}`}
          leading={
            <span className={`tinted flex h-9 w-9 items-center justify-center rounded-full ${worst ? "tone-stuck" : "tone-completed"}`}>
              {worst ? <TrendingDown size={18} aria-hidden /> : <School size={18} aria-hidden />}
            </span>
          }
          title={worst ? `${worst.name} is falling behind` : "No class is falling behind"}
          subtitle={worst ? `${worst.stats.overduePct ?? 0}% overdue · ${worst.stats.stuck} stuck · ${schoolName}` : schoolName}
        />
      )}
    </List>
  );
}
