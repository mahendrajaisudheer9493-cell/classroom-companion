import { InlineKeyboard } from "grammy";
import { assignmentLabel } from "@/lib/bot/cards";
import type { BotContext } from "@/lib/bot/context";
import { callbackData, CB, openAppKeyboard, appUrl } from "@/lib/bot/keyboards";
import { acknowledge } from "@/lib/domain/acknowledge";
import { consumePending, createPending, findOpenPending } from "@/lib/domain/pending";
import {
  addDoubt,
  loadOwn,
  openAssignments,
  reportProgress,
  reportStuck,
  touch,
  type OwnSA,
} from "@/lib/domain/student-actions";
import { pickAssignment } from "@/lib/domain/pick-assignment";
import { getEnv } from "@/lib/env";
import { interpretStudentMessage, type StudentIntent } from "@/lib/llm/interpret-student";
import { formatIst, toIst } from "@/lib/time";

// Student free text → intent (model) → which homework (model id if valid, else the only one, else
// ask) → action (code, via the state machine). Below the confidence threshold we never guess.

export const STUDENT_PENDING_MINUTES = 30;
export const P = {
  which: "student.which",
  choose: "student.choose",
  stuckDetails: "student.stuck_details",
  awaitSubmission: "student.await_submission",
  confirmText: "student.confirm_text",
  confirmInClass: "student.confirm_in_class",
  question: "student.question",
} as const;

/** An intent we can act on, plus "done_menu" for the [Done] choice. */
export type Intent = Exclude<StudentIntent, "other"> | "done_menu";
type Request = { intent: Intent; text: string; doubtText: string | null };

const NOT_SURE = "I'm not sure what you mean.";
export const EXPIRED = "This option has expired.";
const shortLabel = (sa: OwnSA) => {
  const label = assignmentLabel(sa.assignment);
  return label.length > 32 ? `${label.slice(0, 31)}…` : label;
};

// ───────────────────────────── Entry point ─────────────────────────────

export async function handleStudentText(ctx: BotContext, text: string) {
  const user = ctx.appUser;
  const student = user.student!;

  // 1. Is something waiting for this text? (no model needed)
  const open = await findOpenPending<{ saId: string }>(user.id, [P.stuckDetails, P.awaitSubmission]);
  if (open && (await consumePending(open.id, user.id))) {
    const loaded = await loadOwn(user, open.payload.saId);
    if (loaded.ok && open.kind === P.stuckDetails) {
      await addDoubt(user, loaded.sa, text, "added");
      return ctx.reply("Thanks. I've sent that to your teacher.");
    }
    if (loaded.ok && open.kind === P.awaitSubmission) return askConfirmText(ctx, loaded.sa, text);
  }

  // 2. Understand the message.
  const sas = await openAssignments(student.id);
  if (sas.length === 0) {
    return ctx.reply("You have no open homework right now.", { reply_markup: openAppKeyboard("Open my work") });
  }
  await ctx.replyWithChatAction("typing").catch(() => {});
  const result = await interpretStudentMessage(
    text,
    sas.map((sa) => ({ id: sa.id, subject: sa.assignment.subject, title: sa.assignment.title, dueAt: toIst(sa.assignment.dueAt), status: sa.status })),
    { schoolId: student.schoolId, actorUserId: user.id },
  );
  if (!result.ok || result.data.intent === "other" || result.data.confidence < getEnv().LLM_CONFIDENCE_THRESHOLD) {
    return askNotSure(ctx, sas, text);
  }
  const { intent, assignmentId, doubtText } = result.data;
  return routeIntent(ctx, { intent, text, doubtText }, assignmentId, sas);
}

/** "I'm not sure what you mean. [I'm stuck] [Making progress] [Done] [Open my work]" */
async function askNotSure(ctx: BotContext, sas: OwnSA[], text: string) {
  const kb = new InlineKeyboard();
  if (sas.length === 1) {
    const id = sas[0].id;
    kb.text("I'm stuck", callbackData(CB.stuck, id)).text("Making progress", callbackData(CB.progress, id)).text("Done", callbackData(CB.done, id));
  } else {
    const action = await createPending(ctx.appUser.id, P.choose, { text }, STUDENT_PENDING_MINUTES);
    kb.text("I'm stuck", callbackData(CB.studentChoose, action.id, "b"))
      .text("Making progress", callbackData(CB.studentChoose, action.id, "p"))
      .text("Done", callbackData(CB.studentChoose, action.id, "d"));
  }
  kb.row().webApp("Open my work", appUrl("/app"));
  return ctx.reply(NOT_SURE, { reply_markup: kb });
}

/** Resolves which homework (model's id, the only one, or ask), then acts. */
export async function routeIntent(ctx: BotContext, req: Request, saId: string | null, sas?: OwnSA[]) {
  const open = sas ?? (await openAssignments(ctx.appUser.student!.id));
  if (open.length === 0) return ctx.reply("You have no open homework right now.", { reply_markup: openAppKeyboard("Open my work") });
  // Every reply below names the homework, so an automatic pick is always visible to the student.
  const { chosen, ranked } = pickAssignment(req.intent, open, saId);
  if (chosen) return perform(ctx, req, chosen);

  const action = await createPending(ctx.appUser.id, P.which, req, STUDENT_PENDING_MINUTES);
  const kb = new InlineKeyboard();
  for (const sa of ranked.slice(0, 4)) kb.text(shortLabel(sa), callbackData(CB.studentWhich, action.id, sa.id)).row();
  return ctx.reply("Which homework is this about?", { reply_markup: kb });
}

// ───────────────────────────── Actions per intent ─────────────────────────────

export async function perform(ctx: BotContext, req: Request, sa: OwnSA) {
  const user = ctx.appUser;
  const label = assignmentLabel(sa.assignment);
  switch (req.intent) {
    case "acknowledge": {
      const r = await acknowledge(user, sa.id);
      return ctx.reply(r.status === "ok" ? `Got it ✓ ${r.label}` : "This assignment is no longer open.");
    }
    case "progress": {
      const r = await reportProgress(user, sa);
      if (!r.ok) return ctx.reply(statusNote(label, r.status));
      return ctx.reply(`Noted: you're working on ${label} ✓`);
    }
    case "blocked": {
      if (!(req.doubtText ?? req.text).trim()) return stuckAndAskDetails(ctx, sa);
      const r = await reportStuck(user, sa, req.doubtText ?? req.text);
      if (!r.ok) return ctx.reply(statusNote(label, r.status));
      return ctx.reply(`Marked as stuck on ${label}. Your teacher has been notified.`);
    }
    case "question_about_details":
      return showDetails(ctx, sa, req.doubtText ?? req.text);
    case "done_will_send":
      await touch(sa.id);
      await createPending(user.id, P.awaitSubmission, { saId: sa.id }, STUDENT_PENDING_MINUTES);
      return ctx.reply(`Great! Send a photo or file of your work for ${label} here, or type your answer.`, {
        reply_markup: new InlineKeyboard().text("Bringing it to class", callbackData(CB.inClass, sa.id)),
      });
    case "done_in_class": {
      await touch(sa.id);
      const action = await createPending(user.id, P.confirmInClass, { saId: sa.id }, STUDENT_PENDING_MINUTES);
      return ctx.reply(`Mark ${label} as submitted (bringing it to class)?`, {
        reply_markup: new InlineKeyboard().text("Yes", callbackData(CB.studentYes, action.id)).text("No", callbackData(CB.studentNo, action.id)),
      });
    }
    case "done_cannot_upload":
      await touch(sa.id);
      return ctx.reply(`No problem. How will you hand in ${label}?`, {
        reply_markup: new InlineKeyboard()
          .text("Bringing it to class", callbackData(CB.inClass, sa.id))
          .text("I'll type my answer", callbackData(CB.typeAnswer, sa.id)),
      });
    case "submission_text":
      await touch(sa.id);
      return askConfirmText(ctx, sa, req.text);
    case "done_menu":
      await touch(sa.id);
      return ctx.reply(`How will you hand in ${label}?`, {
        reply_markup: new InlineKeyboard()
          .text("Send it now", callbackData(CB.sendNow, sa.id))
          .text("Bringing it to class", callbackData(CB.inClass, sa.id)),
      });
  }
}

/** [I'm stuck] without details: BLOCKED + teacher alerted now, then ask what they're stuck on (30 min). */
export async function stuckAndAskDetails(ctx: BotContext, sa: OwnSA) {
  const label = assignmentLabel(sa.assignment);
  const r = await reportStuck(ctx.appUser, sa, null);
  if (!r.ok) return ctx.reply(statusNote(label, r.status));
  const action = await createPending(ctx.appUser.id, P.stuckDetails, { saId: sa.id }, STUDENT_PENDING_MINUTES);
  return ctx.reply(`Marked as stuck on ${label}. Your teacher has been notified.\nWhat are you stuck on? Type it here, or tap Skip.`, {
    reply_markup: new InlineKeyboard().text("Skip", callbackData(CB.skip, action.id)),
  });
}

/** Facts from the database, never model-written. */
async function showDetails(ctx: BotContext, sa: OwnSA, question: string) {
  await touch(sa.id);
  const a = sa.assignment;
  const lines = [`📘 ${assignmentLabel(a)}`, `Due: ${formatIst(a.dueAt)}`, "", a.instructions];
  if (a.notes) lines.push("", `Note: ${a.notes}`);
  const action = await createPending(ctx.appUser.id, P.question, { saId: sa.id, text: question }, STUDENT_PENDING_MINUTES);
  return ctx.reply(lines.join("\n"), {
    reply_markup: new InlineKeyboard()
      .text("Ask my teacher", callbackData(CB.askTeacher, action.id))
      .text("Got it", callbackData(CB.ack, sa.id)),
  });
}

export async function askConfirmText(ctx: BotContext, sa: OwnSA, text: string) {
  const action = await createPending(ctx.appUser.id, P.confirmText, { saId: sa.id, text }, STUDENT_PENDING_MINUTES);
  return ctx.reply(`Submit this text for ${assignmentLabel(sa.assignment)}?`, {
    reply_markup: new InlineKeyboard().text("Yes, submit", callbackData(CB.studentYes, action.id)).text("No", callbackData(CB.studentNo, action.id)),
  });
}

export function statusNote(label: string, status: string): string {
  if (status === "SUBMITTED") return `${label} is already submitted ✓`;
  if (status === "COMPLETED") return `${label} is already completed ✓`;
  if (status === "NEEDS_REVISION") return `${label} needs a revision. Send your new work when it's ready.`;
  return `Nothing to change for ${label}.`;
}

// Kept here so callers can resume a stored request after "Which homework?".
export async function resumeWhich(ctx: BotContext, pendingId: string, saId: string) {
  const action = await consumePending<Request>(pendingId, ctx.appUser.id);
  if (!action || action.kind !== P.which) return ctx.answerCallbackQuery({ text: EXPIRED });
  const loaded = await loadOwn(ctx.appUser, saId);
  if (!loaded.ok) return ctx.answerCallbackQuery({ text: EXPIRED });
  return perform(ctx, action.payload, loaded.sa);
}

/** si:<pendingId>:<b|p|d>: the student picked an intent from "I'm not sure what you mean". */
export async function resumeChoose(ctx: BotContext, pendingId: string, code: string) {
  const action = await consumePending<{ text: string }>(pendingId, ctx.appUser.id);
  if (!action || action.kind !== P.choose) return ctx.answerCallbackQuery({ text: EXPIRED });
  const intent: Intent = code === "b" ? "blocked" : code === "p" ? "progress" : "done_menu";
  // The original text is unclear, so it isn't used as the doubt; the student is asked for details.
  return routeIntent(ctx, { intent, text: intent === "blocked" ? "" : action.payload.text, doubtText: null }, null);
}
