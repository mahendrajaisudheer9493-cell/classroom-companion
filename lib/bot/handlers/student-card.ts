import { assignmentLabel } from "@/lib/bot/cards";
import type { BotContext } from "@/lib/bot/context";
import { edit } from "@/lib/bot/edit";
import { EXPIRED, P, STUDENT_PENDING_MINUTES, perform, statusNote, stuckAndAskDetails } from "@/lib/bot/handlers/student-text";
import { acknowledge } from "@/lib/domain/acknowledge";
import { consumePending, createPending } from "@/lib/domain/pending";
import {
  addDoubt,
  loadOwn,
  reportProgress,
  stillStuck,
  stuckAgain,
  submitWork,
  type OwnSA,
  type SubmitResult,
} from "@/lib/domain/student-actions";

// Buttons on the student's assignment card and in follow-up messages. Direct buttons carry the
// StudentAssignment id and re-check status, so repeats are harmless; stateful ones use a
// PendingAction that can be used once.

/** [Got it] on an assignment card or an "Updated" message. */
export async function handleAck(ctx: BotContext, saId: string) {
  const result = await acknowledge(ctx.appUser, saId);
  switch (result.status) {
    case "not_found":
      return ctx.answerCallbackQuery({ text: "This assignment no longer exists." });
    case "not_yours":
      return ctx.answerCallbackQuery({ text: "This isn't your assignment." });
    case "cancelled":
      return ctx.answerCallbackQuery({ text: `${result.label} was cancelled. Nothing to do.` });
    case "ok": {
      const text = `Got it ✓ ${result.label}`;
      await ctx.answerCallbackQuery({ text });
      if (result.changed) await ctx.reply(text); // first tap: a chat confirmation; repeats: same answer, no change
    }
  }
}

/** Loads the tapper's own StudentAssignment, or answers why not. */
async function own(ctx: BotContext, saId: string): Promise<OwnSA | null> {
  const loaded = await loadOwn(ctx.appUser, saId);
  if (loaded.ok) return loaded.sa;
  const text = { not_found: "This assignment no longer exists.", not_yours: "This isn't your assignment.", cancelled: "This assignment was cancelled. Nothing to do." }[loaded.reason];
  await ctx.answerCallbackQuery({ text });
  return null;
}

/** stk:<saId> [I'm stuck] */
export async function handleStuck(ctx: BotContext, saId: string) {
  const sa = await own(ctx, saId);
  if (!sa) return;
  if (sa.status === "BLOCKED") return ctx.answerCallbackQuery({ text: "Already marked as stuck. Your teacher knows." });
  return stuckAndAskDetails(ctx, sa);
}

/** don:<saId> [Done] → [Send it now] [Bringing it to class] */
export async function handleDone(ctx: BotContext, saId: string) {
  const sa = await own(ctx, saId);
  if (!sa) return;
  if (sa.status === "COMPLETED") return ctx.answerCallbackQuery({ text: statusNote(assignmentLabel(sa.assignment), sa.status) });
  return perform(ctx, { intent: "done_menu", text: "", doubtText: null }, sa);
}

/** prg:<saId> [Making progress] */
export async function handleProgress(ctx: BotContext, saId: string) {
  const sa = await own(ctx, saId);
  if (!sa) return;
  return perform(ctx, { intent: "progress", text: "", doubtText: null }, sa);
}

/** snw:<saId> [Send it now] and typ:<saId> [I'll type my answer] → wait 30 min for a photo/file/text. */
export async function handleSendNow(ctx: BotContext, saId: string) {
  const sa = await own(ctx, saId);
  if (!sa) return;
  await createPending(ctx.appUser.id, P.awaitSubmission, { saId: sa.id }, STUDENT_PENDING_MINUTES);
  return ctx.reply(`Send a photo or file of your work for ${assignmentLabel(sa.assignment)}, or type your answer.`);
}

export function submitReply(r: SubmitResult, inClass = false): string {
  if (r.status === "duplicate") return `Already received ✓ ${r.label}`;
  if (r.status === "closed") return r.reason === "cancelled" ? `${r.label} was cancelled. Nothing to submit.` : `${r.label} is already completed ✓`;
  return inClass
    ? `Submitted ✓ ${r.label} (bringing it to class). Your teacher will check it in class.`
    : `Submitted ✓ ${r.label}. Your teacher will review it.`;
}

/** inc:<saId> [Bringing it to class] → Submission IN_CLASS → SUBMITTED (repeat = "Already received"). */
export async function handleInClass(ctx: BotContext, saId: string) {
  const r = await submitWork(ctx.appUser, saId, { kind: "IN_CLASS" });
  if ("ok" in r && !r.ok) {
    return ctx.answerCallbackQuery({ text: r.reason === "not_yours" ? "This isn't your assignment." : "This assignment no longer exists." });
  }
  if ("ok" in r) return;
  return ctx.reply(submitReply(r, true));
}

/** sst:<saId> [Still stuck] (morning check-in): stays BLOCKED, teacher told. */
export async function handleStillStuck(ctx: BotContext, saId: string) {
  const sa = await own(ctx, saId);
  if (!sa) return;
  const r = await stillStuck(ctx.appUser, sa);
  if (!r.ok) return ctx.reply(statusNote(assignmentLabel(sa.assignment), r.status));
  const label = assignmentLabel(sa.assignment);
  return ctx.reply(r.alerted ? `OK, still stuck on ${label}. Your teacher has been told again.` : `OK, still stuck on ${label}. Your teacher already knows.`);
}

/** fig:<saId> [Figured it out] → IN_PROGRESS */
export async function handleFiguredOut(ctx: BotContext, saId: string) {
  const sa = await own(ctx, saId);
  if (!sa) return;
  const r = await reportProgress(ctx.appUser, sa);
  if (!r.ok) return ctx.reply(statusNote(assignmentLabel(sa.assignment), r.status));
  return ctx.reply(`Great! Marked as working on ${assignmentLabel(sa.assignment)} ✓`);
}

/** ist:<saId> [I'm still stuck] after the teacher marked the doubt resolved → BLOCKED again. */
export async function handleStuckAgain(ctx: BotContext, saId: string) {
  const sa = await own(ctx, saId);
  if (!sa) return;
  const r = await stuckAgain(ctx.appUser, sa);
  if (!r.ok) return ctx.reply(statusNote(assignmentLabel(sa.assignment), r.status));
  return ctx.reply(`Marked as stuck on ${assignmentLabel(sa.assignment)} again. Your teacher has been notified.`);
}

// ───────────────────── PendingAction buttons (used once) ─────────────────────

/** sy:<pendingId> [Yes, submit] (typed text) / [Yes] (bringing it to class) */
export async function handleStudentYes(ctx: BotContext, pendingId: string) {
  const action = await consumePending<{ saId: string; text?: string }>(pendingId, ctx.appUser.id);
  if (!action || (action.kind !== P.confirmText && action.kind !== P.confirmInClass)) return ctx.answerCallbackQuery({ text: EXPIRED });
  const inClass = action.kind === P.confirmInClass;
  const r = await submitWork(ctx.appUser, action.payload.saId, inClass ? { kind: "IN_CLASS" } : { kind: "TEXT", text: action.payload.text });
  if ("ok" in r) return ctx.answerCallbackQuery({ text: EXPIRED });
  return edit(ctx, submitReply(r, inClass));
}

/** sn:<pendingId> [No] */
export async function handleStudentNo(ctx: BotContext, pendingId: string) {
  const action = await consumePending(pendingId, ctx.appUser.id);
  if (!action) return ctx.answerCallbackQuery({ text: EXPIRED });
  return edit(ctx, "OK, nothing was submitted.");
}

/** skp:<pendingId> [Skip] the stuck details. */
export async function handleSkip(ctx: BotContext, pendingId: string) {
  const action = await consumePending(pendingId, ctx.appUser.id);
  if (!action) return ctx.answerCallbackQuery({ text: EXPIRED });
  return edit(ctx, "OK. Your teacher knows you're stuck and will get back to you.");
}

/** ask:<pendingId> [Ask my teacher] after the details of an assignment: doubt, no status change. */
export async function handleAskTeacher(ctx: BotContext, pendingId: string) {
  const action = await consumePending<{ saId: string; text: string }>(pendingId, ctx.appUser.id);
  if (!action || action.kind !== P.question) return ctx.answerCallbackQuery({ text: EXPIRED });
  const loaded = await loadOwn(ctx.appUser, action.payload.saId);
  if (!loaded.ok) return ctx.answerCallbackQuery({ text: EXPIRED });
  await addDoubt(ctx.appUser, loaded.sa, action.payload.text, "question");
  return ctx.reply(`Sent your question to your teacher ✓ (${loaded.label})`);
}
