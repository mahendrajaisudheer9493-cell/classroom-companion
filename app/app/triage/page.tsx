"use client";

import { Bell, CircleCheckBig, Inbox, MessageCircle, Sparkles, TriangleExclamationPoint } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner, timeAgo } from "@/app/app/_components/status";
import { Loading, Notice } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { NudgeResponse, RiskStudentDto, TriageItemDto, TriageResponse } from "@/app/app/_lib/types";
import { Button, Collapsible, EmptyState, FlagTags, ListRow, SectionHeader, SegmentedTabs, StatusChip, TONE_CLASS, TRIAGE_GROUP } from "@/components/ui";

type Group = "stuck" | "silent" | "overdue" | "toReview";
const GROUPS: Group[] = ["stuck", "silent", "overdue", "toReview"];
const isGroup = (g: string | null): g is Group => !!g && (GROUPS as string[]).includes(g);

/** "Stuck · 3" with the group's icon, in its colour. */
function GroupTitle({ group, count }: { group: Group; count: number }) {
  const m = TRIAGE_GROUP[group];
  const Icon = m.icon;
  return (
    <span className={`${TONE_CLASS[m.tone]} text-tone inline-flex items-center gap-1.5`}>
      <Icon aria-hidden size={14} strokeWidth={2.4} />
      {m.label} · {count}
    </span>
  );
}

// /app/triage[?group=stuck]: who needs attention, most urgent first, one-tap actions.
function Triage() {
  const groupParam = useSearchParams().get("group");
  const only = isGroup(groupParam) ? groupParam : null;
  const [classId, setClassId] = useState<string>("all");
  const [data, setData] = useState<ApiResult<TriageResponse> | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () => apiFetch<TriageResponse>(`/api/app/triage${classId !== "all" ? `?classId=${classId}` : ""}`).then(setData),
    [classId],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(key: string, call: () => Promise<ApiResult<{ message: string }>>) {
    setBusy(key);
    const r = await call();
    setNotice(r.ok ? { text: r.data.message, tone: "success" } : { text: r.message, tone: "error" });
    setBusy(null);
    await load();
  }
  const nudge = (i: TriageItemDto) =>
    act(`nudge:${i.saId}`, () =>
      apiFetch<NudgeResponse>(`/api/app/assignments/${i.assignmentId}/nudge`, { method: "POST", body: JSON.stringify({ saIds: [i.saId] }) }),
    );
  const resolve = (i: TriageItemDto) =>
    act(`resolve:${i.saId}`, () => apiFetch<{ message: string }>(`/api/app/doubts/${i.saId}/resolve`, { method: "POST" }));

  if (!data) return <Loading />;
  if (!data.ok) return <Notice error={data.error} message={data.message} />;
  const t = data.data;
  const groups = only ? [only] : GROUPS;
  const empty = groups.every((g) => t[g].length === 0);
  const className = t.classes.find((c) => c.id === classId)?.name ?? null;

  return (
    <>
      <BackNav />
      <h1 className="text-large font-bold">{only ? TRIAGE_GROUP[only].label : "Triage"}</h1>
      <p className="mb-4 text-body text-tg-hint">
        {only ? (
          <Link href="/app/triage" className="text-tg-link">
            Show all groups
          </Link>
        ) : (
          "Who needs you today, most urgent first."
        )}
      </p>

      {t.classes.length > 1 && (
        <SegmentedTabs value={classId} onChange={setClassId} options={[{ value: "all", label: "All" }, ...t.classes.map((c) => ({ value: c.id, label: c.name }))]} />
      )}

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {!only && <AtRisk className={className} />}

      {empty ? (
        <EmptyState
          icon={only ? CircleCheckBig : Sparkles}
          tone="completed"
          title={only ? `No one is ${TRIAGE_GROUP[only].label.toLowerCase()} right now` : "All clear"}
          detail={only ? undefined : "Nobody needs you right now. New problems will show up here first."}
        />
      ) : (
        groups
          .filter((g) => t[g].length > 0)
          .map((g) => (
            <section key={g} className={`mb-6 ${TONE_CLASS[TRIAGE_GROUP[g].tone]}`}>
              <SectionHeader title={<GroupTitle group={g} count={t[g].length} />} />
              <div className="overflow-hidden rounded-2xl bg-surface shadow-[inset_3px_0_0_var(--tone)]">
                {t[g].map((i) => (
                  <ListRow
                    key={`${g}:${i.saId}`}
                    avatar={i.studentName}
                    title={i.studentName}
                    subtitle={
                      <Link href={`/app/assignments/${i.assignmentId}`} className="text-tg-link">
                        {i.assignment} · {i.className}
                      </Link>
                    }
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip status={i.status} size="sm" />
                      <FlagTags flags={i.flags.filter((f) => !(g === "overdue" && f === "overdue"))} />
                      <span className="text-caption text-tg-hint">
                        {g === "stuck" && i.since ? `stuck ${timeAgo(i.since)}` : i.lastActivityAt ? `active ${timeAgo(i.lastActivityAt)}` : "no activity yet"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g === "stuck" && (
                        <>
                          <Button size="pill" variant="tonal" tone="accent" icon={MessageCircle} href={`/app/doubts/${i.saId}`}>
                            Reply
                          </Button>
                          {i.status === "BLOCKED" && (
                            <Button size="pill" variant="tonal" tone="completed" icon={CircleCheckBig} onClick={() => resolve(i)} disabled={busy !== null}>
                              Mark resolved
                            </Button>
                          )}
                        </>
                      )}
                      {(g === "silent" || g === "overdue") && !i.flags.includes("not_on_telegram") && (
                        <Button size="pill" variant="tonal" tone="accent" icon={Bell} onClick={() => nudge(i)} loading={busy === `nudge:${i.saId}`} disabled={busy !== null}>
                          Nudge
                        </Button>
                      )}
                      {g === "toReview" && (
                        <Button size="pill" variant="tonal" tone="review" icon={Inbox} href={`/app/review/${i.saId}`}>
                          Review
                        </Button>
                      )}
                    </div>
                  </ListRow>
                ))}
              </div>
            </section>
          ))
      )}
    </>
  );
}

/** "Who is at risk this week?": 2+ warning signs across the teacher's classes (computed on the server). */
function AtRisk({ className }: { className: string | null }) {
  const [students, setStudents] = useState<RiskStudentDto[] | null>(null);
  useEffect(() => {
    apiFetch<{ students: RiskStudentDto[] }>("/api/app/risk").then((r) => setStudents(r.ok ? r.data.students : []));
  }, []);
  const shown = (students ?? []).filter((s) => !className || s.className === className);
  if (shown.length === 0) return null;
  return (
    <Collapsible
      tone="overdue"
      icon={<TriangleExclamationPoint aria-hidden size={18} />}
      title={`At risk this week · ${shown.length} student${shown.length === 1 ? "" : "s"}`}
    >
      {shown.map((s) => (
        <ListRow key={s.studentId} href={`/app/students/${s.studentId}`} avatar={s.name} title={`${s.name} (${s.className})`}>
          <ul className="space-y-0.5 text-caption text-tg-hint">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </ListRow>
      ))}
    </Collapsible>
  );
}

export default function TriagePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Triage />
    </Suspense>
  );
}
