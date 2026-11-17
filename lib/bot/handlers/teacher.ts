import { InlineKeyboard } from "grammy";
import { assignmentLabel, draftPreview, dueChangeLine } from "@/lib/bot/cards";
import type { BotContext } from "@/lib/bot/context";
import { edit } from "@/lib/bot/edit";
import { callbackData, CB, openAppKeyboard } from "@/lib/bot/keyboards";
import { prisma } from "@/lib/db";
import {
  parseClock,
  parseDueText,
  resolveChangedDue,
  resolveDue,
  resolveTarget,
  type DueParts,
} from "@/lib/domain/assignment-draft";
import {
  applyCancel,
  applyChange,
  createDraft,
  deleteDraft,
  publishAssignment,
  publishSummary,
  recentManagedAssignments,
  teachingSlots,
  type ChangeRequest,
} from "@/lib/domain/assignments";
import { closeOpenPending, consumePending, createPending, findOpenPending } from "@/lib/domain/pending";
import { getEnv } from "@/lib/env";
import { parseTeacherMessage, type TeacherParse } from "@/lib/llm/parse-teacher";
import { nowIst, toIst } from "@/lib/time";

// Teacher chat: "8A maths ex 4.2 due day after" → preview → [Send]; "move maths 4.2 to monday" →
// preview old → new → [Confirm]. The model reads the text; code resolves and asks; the teacher
// confirms every create/change/cancel.

/** Everything we know about a draft while questions are still open (kept in PendingAction). */
type DraftInput = DueParts & {
  sourceText: string;
  subject: string | null;
  classNames: string[];
  classIds: string[] | null; // set once the teacher picked
  title: string;
  instructions: string;
  notes: string | null;
};

type ButtonQuestion = { input: DraftInput; question: "subject" | "class" | "time"; options: string[] };
type TextQuestion = { input: DraftInput; question: "date" | "time" };
type WhichQuestion = { intent: "change" | "cancel"; changes: DueParts & { instructions: string | null } };

const ASK_BUTTONS = "draft.ask";
const ASK_TEXT = "draft.ask_text";
const COULD_NOT_READ = "I couldn't read that as an assignment. Try again, or create it in the app.";

const createInAppKeyboard = () => openAppKeyboard("Create in app", "/app/assignments/new");

// ───────────────────────────── Entry point ─────────────────────────────

export async function handleTeacherText(ctx: BotContext, text: string) {
  const user = ctx.appUser;
  const now = nowIst();

  // 1. A typed answer to an open question ("When is it due?" / "What time?")?
  const open = await findOpenPending<TextQuestion>(user.id, [ASK_TEXT]);
  if (open) {
    const answered = applyTypedAnswer(open.payload, text);
    if (answered) {
      await consumePending(open.id, user.id);
      return advanceDraft(ctx, answered);
    }
    if (text.length <= 30) {
      const example = open.payload.question === "date" ? "Friday, 23 Nov or tomorrow 5pm" : "4pm or 16:30";
      return ctx.reply(`Sorry, I didn't get that. Try something like "${example}".`);
    }
    await closeOpenPending(user.id, [ASK_TEXT]); // a long message is a new request
  }

  // 2. Read the message with the model.
  await ctx.replyWithChatAction("typing").catch(() => {});
  const slots = teachingSlots(user);
  const candidates = await recentManagedAssignments(user);
  const classes = [...new Set(slots.map((s) => s.className))].map((name) => ({
    name,
    subjects: slots.filter((s) => s.className === name).map((s) => s.subject),
  }));
  const parsed = await parseTeacherMessage(
    text,
    {
      now,
      classes,
      recentAssignments: candidates.map((a) => ({ id: a.id, subject: a.subject, title: a.title, className: a.class.name, dueAt: toIst(a.dueAt) })),
    },
    { schoolId: user.memberships[0]?.schoolId, actorUserId: user.id },
  );

  if (!parsed.ok || parsed.data.intent === "other" || parsed.data.confidence < getEnv().LLM_CONFIDENCE_THRESHOLD) {
    return ctx.reply(COULD_NOT_READ, { reply_markup: createInAppKeyboard() });
  }
  const p = parsed.data;
  if (p.intent === "create") {
    return advanceDraft(ctx, {
      sourceText: text,
      subject: p.subject,
      classNames: p.classNames,
      classIds: null,
      title: p.title,
      instructions: p.instructions,
      notes: p.notes,
      dueDate: p.dueDate,
      timeOfDay: p.timeOfDay,
      explicitTime: p.explicitTime,
    });
  }
  return handleChangeOrCancel(ctx, p, candidates);
}

function applyTypedAnswer(q: TextQuestion, text: string): DraftInput | null {
  if (q.question === "time") {
    const time = parseClock(text);
    return time ? { ...q.input, explicitTime: time, timeOfDay: null } : null;
  }
  const due = parseDueText(text, nowIst());
  if (!due) return null;
  return {
    ...q.input,
    dueDate: due.dueDate,
    explicitTime: due.explicitTime ?? q.input.explicitTime,
    timeOfDay: due.timeOfDay ?? q.input.timeOfDay,
  };
}

// ───────────────────────────── Create ─────────────────────────────

/** Resolves subject → class → date → time, asking for whatever is missing; then saves DRAFT(s) and previews. */
async function advanceDraft(ctx: BotContext, input: DraftInput): Promise<unknown> {
  const user = ctx.appUser;
  const slots = teachingSlots(user);

  let subject: string;
  let classes: { id: string; name: string }[];
  if (input.subject && input.classIds) {
    subject = input.subject;
    classes = slots.filter((s) => s.subject === subject && input.classIds!.includes(s.classId)).map((s) => ({ id: s.classId, name: s.className }));
  } else {
    const target = resolveTarget({ subject: input.subject, classNames: input.classNames }, slots);
    switch (target.kind) {
      case "no_classes":
        return ctx.reply("You don't teach a subject in any class yet. Ask your coordinator for an invite.");
      case "not_teaching":
        return ctx.reply(
          target.className ? `You don't teach ${target.subject} in ${target.className}.` : `You don't teach ${target.subject}.`,
        );
      case "ask_subject":
        return askButtons(ctx, "Which subject?", { input, question: "subject", options: target.options }, target.options);
      case "ask_class":
        return askButtons(
          ctx,
          "Which class?",
          { input: { ...input, subject: target.subject }, question: "class", options: target.options.map((o) => o.id) },
          target.options.map((o) => o.name),
          target.options.length === 2 ? "Both" : "All",
        );
      case "ok":
        subject = target.subject;
        classes = target.classes;
    }
  }
  if (classes.length === 0) return ctx.reply("You don't teach that class any more.");
  const resolved: DraftInput = { ...input, subject, classIds: classes.map((c) => c.id) };

  const due = resolveDue(resolved, nowIst());
  if (due.kind === "need_date") return askText(ctx, "When is it due?", { input: resolved, question: "date" });
  if (due.kind === "past") {
    return askText(ctx, "That time has already passed. When is it due?", {
      input: { ...resolved, dueDate: null, explicitTime: null, timeOfDay: null },
      question: "date",
    });
  }
  if (due.kind === "need_time") {
    return askButtons(ctx, "What time is it due?", { input: resolved, question: "time", options: ["08:00", "17:00"] }, ["8:00 am", "5:00 pm"], "Other");
  }

  for (const klass of classes) {
    const draft = await createDraft(user, {
      subject,
      classId: klass.id,
      title: resolved.title,
      instructions: resolved.instructions,
      notes: resolved.notes,
      dueAt: due.dueAt.toJSDate(),
      sourceText: resolved.sourceText,
    });
    const studentCount = await prisma.student.count({ where: { classId: klass.id } });
    const preview = draftPreview({ ...draft, className: klass.name }, studentCount);
    await ctx.reply(preview.text, { reply_markup: preview.reply_markup });
  }
}

async function askButtons(ctx: BotContext, question: string, q: ButtonQuestion, labels: string[], extra?: string) {
  const action = await createPending(ctx.appUser.id, ASK_BUTTONS, q);
  const kb = new InlineKeyboard();
  labels.forEach((label, i) => kb.text(label, callbackData(CB.answer, action.id, String(i))));
  if (extra) kb.text(extra, callbackData(CB.answer, action.id, q.question === "time" ? "other" : "all"));
  return ctx.reply(question, { reply_markup: kb });
}

async function askText(ctx: BotContext, question: string, q: TextQuestion) {
  await closeOpenPending(ctx.appUser.id, [ASK_TEXT]);
  await createPending(ctx.appUser.id, ASK_TEXT, q);
  const hint = q.question === "date" ? ' (e.g. "Friday", "23 Nov" or "tomorrow 5pm")' : ' (e.g. "4pm" or "16:30")';
  return ctx.reply(question + hint);
}

/** A tapped answer: q:<pendingId>:<index | all | other>. */
export async function handleAnswer(ctx: BotContext, pendingId: string, value: string) {
  const action = await consumePending<ButtonQuestion>(pendingId, ctx.appUser.id);
  if (!action || action.kind !== ASK_BUTTONS) return edit(ctx, "This question has expired. Send the assignment again.");
  const { input, question, options } = action.payload;
  const picked = value === "all" || value === "other" ? value : options[Number(value)];
  if (!picked) return edit(ctx, "This question has expired. Send the assignment again.");

  const original = ctx.callbackQuery?.message?.text ?? "";
  if (question === "subject") {
    await edit(ctx, `${original} ${picked}`);
    return advanceDraft(ctx, { ...input, subject: picked });
  }
  if (question === "class") {
    const ids = picked === "all" ? options : [picked];
    const names = teachingSlots(ctx.appUser).filter((s) => ids.includes(s.classId)).map((s) => s.className);
    await edit(ctx, `${original} ${[...new Set(names)].join(" + ")}`);
    return advanceDraft(ctx, { ...input, classIds: ids });
  }
  // time
  if (picked === "other") {
    await edit(ctx, original);
    return askText(ctx, "What time is it due?", { input, question: "time" });
  }
  await edit(ctx, `${original} ${picked === "08:00" ? "8:00 am" : "5:00 pm"}`);
  return advanceDraft(ctx, { ...input, explicitTime: picked, timeOfDay: null });
}

/** [Send] on a preview. Idempotent: a second tap only says "Already sent". */
export async function handleSend(ctx: BotContext, assignmentId: string) {
  const result = await publishAssignment(ctx.appUser, assignmentId);
  if (result.status === "already_sent") return ctx.answerCallbackQuery({ text: "Already sent" });
  if (result.status === "not_found") return edit(ctx, "This draft no longer exists. Nothing was sent.");
  const preview = ctx.callbackQuery?.message?.text ?? "";
  return edit(ctx, `${preview}\n\n✅ ${publishSummary(result)}`, { reply_markup: openAppKeyboard("Open") });
}

/** [Cancel] on a preview: delete the draft. */
export async function handleDeleteDraft(ctx: BotContext, assignmentId: string) {
  const result = await deleteDraft(ctx.appUser, assignmentId);
  if (result === "not_draft") return ctx.answerCallbackQuery({ text: "Already sent or deleted" });
  return edit(ctx, "Draft deleted. Nothing was sent.");
}

// ───────────────────────────── Change / cancel ─────────────────────────────

type Candidate = Awaited<ReturnType<typeof recentManagedAssignments>>[number];
const candidateLabel = (a: Candidate) => `${assignmentLabel(a)} (${a.class.name})`;

async function handleChangeOrCancel(ctx: BotContext, p: TeacherParse, candidates: Candidate[]) {
  const intent = p.intent as "change" | "cancel";
  const changes = {
    dueDate: p.changes?.dueDate ?? p.dueDate,
    timeOfDay: p.changes?.timeOfDay ?? p.timeOfDay,
    explicitTime: p.changes?.explicitTime ?? p.explicitTime,
    instructions: p.changes?.instructions ?? null,
  };
  if (candidates.length === 0) return ctx.reply(`You have no sent assignments from the last 30 days to ${intent}.`);

  const match = candidates.find((c) => c.id === p.assignmentId);
  if (match) return previewChangeOrCancel(ctx, intent, match, changes);

  // Not sure which one: offer up to 3, preferring the subject the teacher mentioned.
  const sameSubject = p.subject ? candidates.filter((c) => c.subject.toLowerCase() === p.subject!.toLowerCase()) : [];
  const options = (sameSubject.length ? sameSubject : candidates).slice(0, 3);
  const action = await createPending<WhichQuestion>(ctx.appUser.id, "assignment.which", { intent, changes });
  const kb = new InlineKeyboard();
  for (const c of options) kb.text(candidateLabel(c).slice(0, 60), callbackData(CB.which, action.id, c.id)).row();
  return ctx.reply("Which one?", { reply_markup: kb });
}

/** wh:<pendingId>:<assignmentId> */
export async function handleWhich(ctx: BotContext, pendingId: string, assignmentId: string) {
  const action = await consumePending<WhichQuestion>(pendingId, ctx.appUser.id);
  if (!action || action.kind !== "assignment.which") return edit(ctx, "This question has expired. Send your message again.");
  const candidate = (await recentManagedAssignments(ctx.appUser)).find((c) => c.id === assignmentId);
  if (!candidate) return edit(ctx, "That assignment can't be changed any more.");
  await edit(ctx, `Which one? ${candidateLabel(candidate)}`);
  return previewChangeOrCancel(ctx, action.payload.intent, candidate, action.payload.changes);
}

async function previewChangeOrCancel(
  ctx: BotContext,
  intent: "change" | "cancel",
  a: Candidate,
  changes: WhichQuestion["changes"],
) {
  const confirmKb = (pendingId: string, yes: string, no: string) =>
    new InlineKeyboard().text(yes, callbackData(CB.confirm, pendingId)).text(no, callbackData(CB.abort, pendingId));

  if (intent === "cancel") {
    const action = await createPending(ctx.appUser.id, "assignment.cancel", { assignmentId: a.id });
    return ctx.reply(`Cancel ${candidateLabel(a)}?\nStudents who have it will be told there's nothing to submit.`, {
      reply_markup: confirmKb(action.id, "Confirm cancel", "Keep it"),
    });
  }

  const due = resolveChangedDue(toIst(a.dueAt), changes, nowIst());
  const instructions = changes.instructions?.trim() && changes.instructions.trim() !== a.instructions ? changes.instructions.trim() : null;
  if (due.kind === "past") return ctx.reply("That time has already passed. Send the change again with a later date.");
  if (due.kind === "unchanged" && !instructions) {
    return ctx.reply(`What should change for ${candidateLabel(a)}? For example: "move it to Monday 8am".`);
  }

  const req: ChangeRequest = {
    assignmentId: a.id,
    expectedVersion: a.version,
    dueAt: due.kind === "ok" ? due.dueAt.toUTC().toISO() : null,
    instructions,
  };
  const action = await createPending(ctx.appUser.id, "assignment.change", req);
  const lines = [`Change ${candidateLabel(a)}`];
  if (req.dueAt) lines.push(dueChangeLine(a.dueAt, new Date(req.dueAt)));
  if (instructions) lines.push(`Instructions: ${instructions}`);
  return ctx.reply(lines.join("\n"), { reply_markup: confirmKb(action.id, "Confirm", "Cancel") });
}

/** cfm:<pendingId> → apply the change or cancellation (once). */
export async function handleConfirm(ctx: BotContext, pendingId: string) {
  const action = await consumePending<ChangeRequest | { assignmentId: string }>(pendingId, ctx.appUser.id);
  const original = ctx.callbackQuery?.message?.text ?? "";
  if (!action) return ctx.answerCallbackQuery({ text: "Already done or expired" });

  if (action.kind === "assignment.change") {
    const result = await applyChange(ctx.appUser, action.payload as ChangeRequest);
    if (result.status === "conflict") return edit(ctx, `${original}\n\nThis assignment changed in the meantime. Send your change again.`);
    if (result.status === "not_found") return edit(ctx, `${original}\n\nThis assignment can't be changed any more.`);
    const told = result.notified + result.resent;
    return edit(ctx, `${original}\n\n✅ Updated. ${told} student${told === 1 ? "" : "s"} notified; they'll be asked to acknowledge again.`, {
      reply_markup: openAppKeyboard("Open"),
    });
  }
  if (action.kind === "assignment.cancel") {
    const result = await applyCancel(ctx.appUser, action.payload.assignmentId);
    if (result.status === "not_found") return edit(ctx, `${original}\n\nAlready cancelled.`);
    return edit(ctx, `${original}\n\n✅ Cancelled. ${result.notified} student${result.notified === 1 ? "" : "s"} told.`);
  }
  return ctx.answerCallbackQuery({ text: "This button has expired." });
}

/** abt:<pendingId> */
export async function handleAbort(ctx: BotContext, pendingId: string) {
  await consumePending(pendingId, ctx.appUser.id);
  const original = ctx.callbackQuery?.message?.text ?? "";
  return edit(ctx, `${original}\n\nOK, nothing changed.`);
}

