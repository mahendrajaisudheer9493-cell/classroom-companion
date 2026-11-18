"use client";

import { parseRoster, rosterPreview } from "@/lib/domain/roster-parse";

// Paste box for student names with a live preview, using the exact parser the server uses.

const input = "w-full rounded-lg border border-tg-hint/30 bg-field px-3 py-2 text-tg-text";

export function RosterPaste({ value, onChange, label = "Student names" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const names = parseRoster(value);
  return (
    <label className="block space-y-1">
      <span className="text-sm text-tg-hint">{label}</span>
      <textarea
        className={`${input} min-h-28`}
        placeholder={"One name per line, or separated by commas\ne.g. Test One, Test Two, Test Three"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={`block text-xs ${names.length ? "text-tg-text" : "text-tg-hint"}`} aria-live="polite">
        {rosterPreview(names)}
      </span>
    </label>
  );
}

export const rosterCount = (value: string) => parseRoster(value).length;
