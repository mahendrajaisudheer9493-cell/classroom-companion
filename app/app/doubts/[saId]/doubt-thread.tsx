"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading, Notice, Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { DoubtThreadResponse } from "@/app/app/_lib/types";

// /app/doubts/:saId: read-only thread for now; replying arrives in Task 5.
export function DoubtThread() {
  const { saId } = useParams<{ saId: string }>();
  const [thread, setThread] = useState<ApiResult<DoubtThreadResponse> | null>(null);
  useEffect(() => {
    apiFetch<DoubtThreadResponse>(`/api/app/doubts/${saId}`).then(setThread);
  }, [saId]);

  if (!thread) return <Loading />;
  if (!thread.ok) return <Notice error={thread.error} message={thread.message} />;
  const t = thread.data;
  return (
    <>
      <Link href="/app" className="mb-3 inline-block text-sm text-tg-link">
        ‹ Home
      </Link>
      <p className="text-sm text-tg-hint">{t.assignment}</p>
      <h1 className="mb-5 text-xl font-semibold">
        {t.studentName} ({t.className})
      </h1>
      <Section title="Doubt">
        {t.messages.length === 0 && <p className="px-4 py-3 text-sm text-tg-hint">No messages yet.</p>}
        {t.messages.map((m) => (
          <div key={m.id} className="border-b border-tg-hint/15 px-4 py-3 last:border-b-0">
            <p className="text-xs text-tg-hint">
              {m.author} · {new Date(m.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
      </Section>
      <p className="text-sm text-tg-hint">Replying from here is coming soon.</p>
    </>
  );
}
