"use client";

import { BookOpen, CalendarClock, CircleCheckBig, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, haptic, type ApiResult } from "@/app/app/_lib/telegram";
import type { MyWorkItem, MyWorkResponse } from "@/app/app/_lib/types";
import { Chip, Collapsible, EmptyState, List, ListRow, SkeletonList, StatusChip, statusMeta, TONE_CLASS } from "@/components/ui";

const OPEN_GROUPS: { key: "overdue" | "today" | "week" | "later"; title: string }[] = [
  { key: "overdue", title: "Overdue" },
  { key: "today", title: "Due today" },
  { key: "week", title: "This week" },
  { key: "later", title: "Later" },
];

function WorkRow({ item, overdue }: { item: MyWorkItem; overdue?: boolean }) {
  const m = statusMeta(item.status);
  const Icon = m.icon;
  return (
    <ListRow
      href={`/app/work/${item.saId}`}
      leading={
        <span className={`tinted flex h-9 w-9 items-center justify-center rounded-full ${TONE_CLASS[m.tone]}`}>
          <Icon aria-hidden size={18} />
        </span>
      }
      title={<span className="whitespace-normal">{item.title}</span>}
      subtitle={
        <>
          {item.subject} · <span className={overdue ? "tone-overdue text-tone font-medium" : ""}>due {item.dueLabel}</span>
        </>
      }
    >
      <div className="flex flex-wrap gap-1">
        <StatusChip status={item.status} size="sm" />
        {item.updated && (
          <Chip tone="silent" icon={CalendarClock} size="sm">
            Updated
          </Chip>
        )}
      </div>
    </ListRow>
  );
}

/** The most urgent open item: overdue first, then today, this week, later. */
function NextDue({ item, overdue }: { item: MyWorkItem; overdue: boolean }) {
  return (
    <Link
      href={`/app/work/${item.saId}`}
      onClick={() => haptic.tap()}
      className={`mb-6 block rounded-2xl p-4 active:opacity-80 ${overdue ? "tinted tone-overdue" : "bg-tg-button text-tg-button-text"}`}
    >
      <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide opacity-90">
        {overdue ? <Clock size={14} aria-hidden /> : <CalendarClock size={14} aria-hidden />}
        {overdue ? "Overdue" : "Next due"}
      </p>
      <p className="mt-1 text-title font-bold leading-tight">{item.title}</p>
      <p className="text-body opacity-90">
        {item.subject} · due {item.dueLabel}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-surface p-0.5">
          <StatusChip status={item.status} size="sm" />
        </span>
        <span className="text-body font-semibold">Open ›</span>
      </div>
    </Link>
  );
}

/** Student "My work": next due, then Overdue · Due today · This week · Later, Done collapsed. */
export function MyWork() {
  const [data, setData] = useState<ApiResult<MyWorkResponse> | null>(null);
  useEffect(() => {
    apiFetch<MyWorkResponse>("/api/app/my-work").then(setData);
  }, []);

  if (!data) return <SkeletonList rows={3} />;
  if (!data.ok) return <EmptyState icon={BookOpen} title="Couldn't load your work" detail={data.message} />;
  const w = data.data;
  const open = OPEN_GROUPS.flatMap((g) => w[g.key]);
  if (open.length === 0 && w.done.length === 0) {
    return <EmptyState icon={BookOpen} tone="accent" title="No homework yet" detail="New work from your teachers will appear here and in the chat." />;
  }
  const next = w.overdue[0] ?? w.today[0] ?? w.week[0] ?? w.later[0];

  return (
    <>
      {next ? (
        <NextDue item={next} overdue={w.overdue.length > 0} />
      ) : (
        <EmptyState icon={CircleCheckBig} tone="completed" title="All done" detail="Nothing left to hand in. Well done!" className="py-6" />
      )}
      {OPEN_GROUPS.filter((g) => w[g.key].length > 0).map((g) => (
        <List key={g.key} title={`${g.title} · ${w[g.key].length}`}>
          {w[g.key].map((item) => (
            <WorkRow key={item.saId} item={item} overdue={g.key === "overdue"} />
          ))}
        </List>
      ))}
      {w.done.length > 0 && (
        <Collapsible title={`Done · ${w.done.length}`} icon={<CircleCheckBig aria-hidden size={18} className="tone-completed text-tone" />}>
          {w.done.map((item) => (
            <WorkRow key={item.saId} item={item} />
          ))}
        </Collapsible>
      )}
    </>
  );
}
