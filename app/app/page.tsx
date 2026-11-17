"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading, Notice, Row, Section } from "@/app/app/_components/ui";
import { apiFetch, type ApiResult } from "@/app/app/_lib/telegram";
import type { MeResponse } from "@/app/app/_lib/types";

// /app: role-aware home. One section per role the person has.
export default function HomePage() {
  const [me, setMe] = useState<ApiResult<MeResponse> | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>("/api/app/me").then(setMe);
  }, []);

  if (!me) return <Loading />;
  if (!me.ok) return <Notice error={me.error} message={me.message} />;
  const { displayName, student, classes, coordinatorOf } = me.data;

  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Hi, {student?.name ?? displayName}</h1>

      {student && (
        <Section title="My work">
          <Row>
            <div>
              <p className="font-medium">
                {student.className} · {student.schoolName}
              </p>
              <p className="text-sm text-tg-hint">Your assignments will appear here.</p>
            </div>
          </Row>
        </Section>
      )}

      {classes.some((c) => c.subjects.length > 0) && (
        <Link href="/app/assignments/new" className="mb-5 block rounded-xl bg-tg-button px-4 py-3 text-center font-medium text-tg-button-text">
          + New assignment
        </Link>
      )}

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

      {coordinatorOf.map((s) => (
        <Section key={s.schoolId} title="School health">
          <Row>
            <div>
              <p className="font-medium">{s.schoolName}</p>
              <p className="text-sm text-tg-hint">Class-by-class progress will appear here.</p>
            </div>
          </Row>
        </Section>
      ))}
    </>
  );
}
