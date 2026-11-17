"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BackNav } from "@/app/app/_components/nav";
import { Banner, Flags, StatusChip, timeAgo } from "@/app/app/_components/status";
import { Button, Loading, Notice, Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { NudgeResponse, TriageItemDto, TriageResponse } from "@/app/app/_lib/types";

type Group = "stuck" | "silent" | "overdue" | "toReview";
const GROUPS: { key: Group; title: string }[] = [
  { key: "stuck", title: "🆘 Stuck" },
  { key: "silent", title: "👀 Silent" },
  { key: "overdue", title: "⏰ Overdue" },
  { key: "toReview", title: "📥 To review" },
];

// /app/triage: "talk to these 4 today". Most urgent first, one-tap actions.
export default function TriagePage() {
  const [classId, setClassId] = useState<string | null>(null);
  const [data, setData] = useState<ApiResult<TriageResponse> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () => apiFetch<TriageResponse>(`/api/app/triage${classId ? `?classId=${classId}` : ""}`).then(setData),
    [classId],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(key: string, call: () => Promise<ApiResult<{ message: string }>>) {
    setBusy(key);
    const r = await call();
    setNotice(r.ok ? r.data.message : r.message);
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
  const empty = GROUPS.every((g) => t[g.key].length === 0);

  return (
    <>
      <BackNav />
      <h1 className="mb-3 text-xl font-semibold">Triage</h1>

      {t.classes.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          {[{ id: null, name: "All classes" }, ...t.classes].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              onClick={() => setClassId(c.id)}
              className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-medium ${classId === c.id ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary-bg"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {notice && <Banner>{notice}</Banner>}

      {empty ? (
        <div className="py-16 text-center">
          <p className="text-2xl font-semibold">All clear ✓</p>
          <p className="mt-1 text-tg-hint">Nobody needs you right now.</p>
        </div>
      ) : (
        GROUPS.filter((g) => t[g.key].length > 0).map((g) => (
          <Section key={g.key} title={`${g.title} · ${t[g.key].length}`}>
            {t[g.key].map((i) => (
              <div key={`${g.key}:${i.saId}`} className="border-b border-tg-hint/15 px-4 py-3 last:border-b-0">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {i.studentName} <span className="font-normal text-tg-hint">({i.className})</span>
                    </p>
                    <Link href={`/app/assignments/${i.assignmentId}`} className="block truncate text-sm text-tg-link">
                      {i.assignment}
                    </Link>
                    <p className="text-xs text-tg-hint">
                      Due {i.dueLabel} · {g.key === "stuck" && i.since ? `stuck since ${timeAgo(i.since)}` : `last activity ${timeAgo(i.lastActivityAt)}`}
                    </p>
                  </div>
                  <StatusChip status={i.status} />
                </div>
                <div className="mt-1.5">
                  <Flags flags={i.flags.filter((f) => !(g.key === "overdue" && f === "overdue"))} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {g.key === "stuck" && (
                    <>
                      <Link href={`/app/doubts/${i.saId}`} className="flex min-h-10 items-center rounded-lg bg-tg-button px-3.5 text-sm font-medium text-tg-button-text">
                        Reply
                      </Link>
                      {i.status === "BLOCKED" && (
                        <Button variant="secondary" onClick={() => resolve(i)} disabled={busy !== null}>
                          Mark resolved
                        </Button>
                      )}
                    </>
                  )}
                  {(g.key === "silent" || g.key === "overdue") && !i.flags.includes("not_on_telegram") && (
                    <Button variant="secondary" onClick={() => nudge(i)} disabled={busy !== null}>
                      {busy === `nudge:${i.saId}` ? "Nudging…" : "Nudge"}
                    </Button>
                  )}
                  {g.key === "toReview" && (
                    <Link href={`/app/review/${i.saId}`} className="flex min-h-10 items-center rounded-lg bg-tg-button px-3.5 text-sm font-medium text-tg-button-text">
                      Review
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </Section>
        ))
      )}
    </>
  );
}
