"use client";

import { Row, Section } from "@/app/app/_components/ui";

/** Student "My work" (Task 5 commit 4 fills this in). */
export function MyWork() {
  return (
    <Section title="My work">
      <Row>
        <p className="text-sm text-tg-hint">Your assignments will appear here.</p>
      </Row>
    </Section>
  );
}
