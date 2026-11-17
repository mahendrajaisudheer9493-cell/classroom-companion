import { InlineKeyboard } from "grammy";
import type { DateTime } from "luxon";
import { appUrl, callbackData, CB } from "@/lib/bot/keyboards";
import type { OutboundPayload } from "@/lib/queue/outbound";
import { formatIst, toIst } from "@/lib/time";

// Message cards sent through the outbound queue (stored as JSON, so keyboards are plain objects).

type CardAssignment = {
  id: string;
  subject: string;
  title: string;
  instructions: string;
  notes: string | null;
  dueAt: Date;
};

export const assignmentLabel = (a: { subject: string; title: string }) => `${a.subject} · ${a.title}`;

const markup = (kb: InlineKeyboard) => ({ inline_keyboard: kb.inline_keyboard });

/** The student's assignment card: [Got it] [I'm stuck] [Done] [Open]. */
export function assignmentCard(a: CardAssignment, saId: string): OutboundPayload {
  const lines = [`📘 ${assignmentLabel(a)}`, `Due: ${formatIst(a.dueAt)}`, "", a.instructions];
  if (a.notes) lines.push("", `Note: ${a.notes}`);
  const kb = new InlineKeyboard()
    .text("Got it", callbackData(CB.ack, saId))
    .text("I'm stuck", callbackData(CB.stuck, saId))
    .text("Done", callbackData(CB.done, saId))
    .row()
    .webApp("Open", appUrl(`/app/work/${saId}`));
  return { text: lines.join("\n"), reply_markup: markup(kb), meta: { assignmentId: a.id, studentAssignmentId: saId } };
}

/** "Updated: Maths 4.2 now due Mon 23 Nov, 8:00 am (was Thu 19 Nov). [Got it] [Open]" */
export function updatedCard(
  a: CardAssignment,
  saId: string,
  change: { oldDueAt: Date | null; instructionsChanged: boolean },
): OutboundPayload {
  const lines: string[] = [];
  if (change.oldDueAt) {
    lines.push(`Updated: ${assignmentLabel(a)} now due ${formatIst(a.dueAt)} (was ${toIst(change.oldDueAt).toFormat("ccc d LLL")}).`);
  } else {
    lines.push(`Updated: ${assignmentLabel(a)}. Due ${formatIst(a.dueAt)}.`);
  }
  if (change.instructionsChanged) lines.push("", `New instructions: ${a.instructions}`);
  const kb = new InlineKeyboard()
    .text("Got it", callbackData(CB.ack, saId))
    .webApp("Open", appUrl(`/app/work/${saId}`));
  return { text: lines.join("\n"), reply_markup: markup(kb), meta: { assignmentId: a.id, studentAssignmentId: saId } };
}

export function cancelledCard(a: CardAssignment, saId: string): OutboundPayload {
  return {
    text: `Cancelled: ${assignmentLabel(a)}. Nothing to submit.`,
    meta: { assignmentId: a.id, studentAssignmentId: saId },
  };
}

/** Teacher preview of a draft: [Send] [Edit in app] [Cancel]. */
export function draftPreview(
  a: CardAssignment & { className: string },
  studentCount: number,
): { text: string; reply_markup: InlineKeyboard } {
  const lines = [`📘 ${a.subject} · ${a.className} (${studentCount} students)`, a.title];
  if (a.instructions && a.instructions !== a.title) lines.push(a.instructions);
  lines.push(`Due: ${formatIst(a.dueAt)}`);
  if (a.notes) lines.push(`⚠ Note: ${a.notes}`);
  const kb = new InlineKeyboard()
    .text("Send", callbackData(CB.send, a.id))
    .webApp("Edit in app", appUrl(`/app/assignments/new?draft=${a.id}`))
    .text("Cancel", callbackData(CB.deleteDraft, a.id));
  return { text: lines.join("\n"), reply_markup: kb };
}

export function dueChangeLine(oldDueAt: Date, newDueAt: Date | DateTime) {
  return `Due: ${formatIst(oldDueAt)} → ${formatIst(newDueAt)}`;
}

// ───────────────────── Messages from the teacher (via the Mini App) ─────────────────────

const studentButtons = (saId: string, first: [string, string]) =>
  new InlineKeyboard().text(first[0], first[1]).webApp("Open", appUrl(`/app/work/${saId}`));

/** [Nudge]: "Your teacher is checking on Maths 4.2 · due Thu 8:00 am. [Got it] [I'm stuck]" */
export function nudgeCard(a: CardAssignment, saId: string): OutboundPayload {
  const kb = new InlineKeyboard().text("Got it", callbackData(CB.ack, saId)).text("I'm stuck", callbackData(CB.stuck, saId));
  return {
    text: `Your teacher is checking on ${assignmentLabel(a)} · due ${formatIst(a.dueAt)}.`,
    reply_markup: markup(kb),
    meta: { assignmentId: a.id, studentAssignmentId: saId },
  };
}

/** Teacher marked the doubt resolved: "… Still stuck? [I'm still stuck]" */
export function resolvedCard(a: CardAssignment, saId: string): OutboundPayload {
  return {
    text: `Your teacher marked your doubt on ${assignmentLabel(a)} as resolved. Still stuck?`,
    reply_markup: markup(studentButtons(saId, ["I'm still stuck", callbackData(CB.stuckAgain, saId)])),
    meta: { assignmentId: a.id, studentAssignmentId: saId },
  };
}

/** "Mrs. Rao replied about Maths 4.2: … [I'm still stuck] [Open]" */
export function replyCard(a: CardAssignment, saId: string, teacherName: string, text: string, doubtMessageId: string): OutboundPayload {
  return {
    text: `${teacherName} replied about ${assignmentLabel(a)}:\n${text}`,
    reply_markup: markup(studentButtons(saId, ["I'm still stuck", callbackData(CB.stuckAgain, saId)])),
    meta: { assignmentId: a.id, studentAssignmentId: saId, doubtMessageId },
  };
}

/** Review result: Completed, or Needs revision + [Resubmit] (works like [Done]). */
export function feedbackCard(
  a: CardAssignment,
  saId: string,
  teacherName: string,
  result: "COMPLETED" | "NEEDS_REVISION",
  comment: string,
): OutboundPayload {
  const quoted = comment.trim() ? `: "${comment.trim()}"` : "";
  if (result === "COMPLETED") {
    return {
      text: `${teacherName} reviewed ${assignmentLabel(a)}${quoted} ✓ Completed`,
      reply_markup: markup(new InlineKeyboard().webApp("Open", appUrl(`/app/work/${saId}`))),
      meta: { assignmentId: a.id, studentAssignmentId: saId },
    };
  }
  return {
    text: `${teacherName} reviewed ${assignmentLabel(a)}. Needs revision${quoted}`,
    reply_markup: markup(studentButtons(saId, ["Resubmit", callbackData(CB.done, saId)])),
    meta: { assignmentId: a.id, studentAssignmentId: saId },
  };
}
