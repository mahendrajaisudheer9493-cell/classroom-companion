// Pasted roster → clean student names. Pure (no server imports) so the Mini App can show the same
// live preview the server will save.

export const MAX_NAME = 80;

/**
 * Names separated by new lines or commas (also ";"); spaces trimmed and collapsed; "1." / "2)"
 * numbering dropped; empty entries and duplicates (ignoring case) removed; order kept.
 */
export function parseRoster(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of text.split(/[\r\n,;]+/)) {
    const name = raw
      .replace(/^\s*\d+\s*[.)\-:]\s*/, "") // "1. Name", "2) Name", "3 - Name"
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** "3 students: Test One, Test Two, Test Three" (first 8 names, then "and N more"). */
export function rosterPreview(names: string[]): string {
  if (names.length === 0) return "No names yet. Put each name on its own line or separate them with commas.";
  const shown = names.slice(0, 8).join(", ");
  const more = names.length > 8 ? ` and ${names.length - 8} more` : "";
  return `${names.length} student${names.length === 1 ? "" : "s"}: ${shown}${more}`;
}
