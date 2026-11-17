"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusChip } from "@/app/app/_components/status";
import { Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { MyWorkItem, MyWorkResponse } from "@/app/app/_lib/types";

const GROUPS: { key: keyof MyWorkResponse; title: string }[] = [
  { key: "overdue", title: "Overdue" },
  { key: "today", title: "Due today" },
  { key: "week", title: "This week" },
  { key: "later", title: "Later" },
  { key: "done", title: "Done" },
];

function WorkCard({ item }: { item: MyWorkItem }) {
  return (
    <Link href={`/app/work/${item.saId}`} className="flex items-center gap-3 border-b border-tg-hint/15 px-4 py-3 last:border-b-0 active:opacity-70">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {item.subject} · {item.title}
        </p>
        <p className="text-sm text-tg-hint">
          Due {item.dueLabel}
          {item.updated && <span className="ml-2 rounded bg-amber-500/20 px-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">Updated</span>}
        </p>
      </div>
      <StatusChip status={item.status} />
    </Link>
  );
}

/** Student "My work": Overdue · Due today · This week · Later · Done. */
export function MyWork() {
  const [data, setData] = useState<ApiResult<MyWorkResponse> | null>(null);
  useEffect(() => {
    apiFetch<MyWorkResponse>("/api/app/my-work").then(setData);
  }, []);

  if (!data) return <p className="py-6 text-center text-tg-hint">Loading your work…</p>;
  if (!data.ok) return <p className="py-6 text-center text-tg-hint">{data.message}</p>;
  const empty = GROUPS.every((g) => data.data[g.key].length === 0);
  if (empty) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-semibold">No homework yet ✓</p>
        <p className="text-tg-hint">New assignments from your teachers will appear here and in the chat.</p>
      </div>
    );
  }
  return (
    <>
      {GROUPS.filter((g) => data.data[g.key].length > 0).map((g) => (
        <Section key={g.key} title={`${g.title} · ${data.data[g.key].length}`}>
          {data.data[g.key].map((item) => (
            <WorkCard key={item.saId} item={item} />
          ))}
        </Section>
      ))}
    </>
  );
}
