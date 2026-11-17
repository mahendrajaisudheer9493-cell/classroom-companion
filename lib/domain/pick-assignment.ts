import type { StudentAssignmentStatus } from "@prisma/client";

// "Which homework is this about?" — asked only when we really can't tell. For a done / submission /
// progress message, work that is already SUBMITTED or COMPLETED is the unlikely answer.

/** Intents about handing in or working on homework. */
export const WORK_INTENTS = ["progress", "done_will_send", "done_in_class", "done_cannot_upload", "submission_text", "done_menu", "submit_file"] as const;

const HANDED_IN: StudentAssignmentStatus[] = ["SUBMITTED", "COMPLETED"];
const notHandedIn = (sa: { status: StudentAssignmentStatus }) => !HANDED_IN.includes(sa.status);

/**
 * Picks the homework for a message. Order: the model's choice (if it's one of the candidates) →
 * the only open one → for work intents, the only one not yet handed in → null (ask).
 * `ranked` is the order for the "Which homework?" buttons: not-yet-handed-in first for work intents.
 */
export function pickAssignment<T extends { id: string; status: StudentAssignmentStatus }>(
  intent: string,
  open: T[],
  modelChoice: string | null,
): { chosen: T | null; ranked: T[] } {
  const isWork = (WORK_INTENTS as readonly string[]).includes(intent);
  const ranked = isWork ? [...open.filter(notHandedIn), ...open.filter((sa) => !notHandedIn(sa))] : open;
  const fromModel = modelChoice ? open.find((sa) => sa.id === modelChoice) : undefined;
  if (fromModel) return { chosen: fromModel, ranked };
  if (open.length === 1) return { chosen: open[0], ranked };
  const stillToDo = open.filter(notHandedIn);
  if (isWork && stillToDo.length === 1) return { chosen: stillToDo[0], ranked };
  return { chosen: null, ranked };
}
