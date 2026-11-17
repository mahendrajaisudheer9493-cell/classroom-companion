import { InlineKeyboard } from "grammy";
import { assignmentLabel } from "@/lib/bot/cards";
import type { BotContext } from "@/lib/bot/context";
import { edit } from "@/lib/bot/edit";
import { submitReply } from "@/lib/bot/handlers/student-card";
import { EXPIRED, P, STUDENT_PENDING_MINUTES } from "@/lib/bot/handlers/student-text";
import { callbackData, CB, openAppKeyboard } from "@/lib/bot/keyboards";
import { consumePending, createPending, findOpenPending } from "@/lib/domain/pending";
import { addFileDoubt, loadOwn, openAssignments, submitWork, type OwnSA } from "@/lib/domain/student-actions";

// Photos and documents from students. Every attachment is confirmed before it counts (S5):
// one open homework → [Yes, submit] [No, it's a doubt]; several → "Which homework is this for?".
// Files stay in Telegram: we keep file_id / file_unique_id, never the file.

type IncomingFile = {
  kind: "PHOTO" | "FILE";
  fileId: string;
  fileUniqueId: string;
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
};

const FILE_CONFIRM = "student.confirm_file"; // { saId, file }
const FILE_WHICH = "student.file_which"; // { saIds, file } → submit to the picked one
const FILE_DOUBT_WHICH = "student.file_doubt_which"; // { saIds, file } → doubt about the picked one

function incomingFile(ctx: BotContext): IncomingFile | null {
  const msg = ctx.message;
  if (!msg) return null;
  const caption = msg.caption?.trim() || null;
  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    return { kind: "PHOTO", fileId: largest.file_id, fileUniqueId: largest.file_unique_id, mimeType: "image/jpeg", fileName: null, caption };
  }
  if (msg.document) {
    const d = msg.document;
    return { kind: "FILE", fileId: d.file_id, fileUniqueId: d.file_unique_id, mimeType: d.mime_type ?? null, fileName: d.file_name ?? null, caption };
  }
  return null;
}

const shortLabel = (sa: OwnSA) => {
  const label = assignmentLabel(sa.assignment);
  return label.length > 32 ? `${label.slice(0, 31)}…` : label;
};

export async function handleStudentMedia(ctx: BotContext) {
  const user = ctx.appUser;
  const file = incomingFile(ctx);
  if (!file || !user.student) return;

  // After [Send it now] / "done, will send": we already know which homework.
  const waiting = await findOpenPending<{ saId: string }>(user.id, [P.awaitSubmission]);
  if (waiting && (await consumePending(waiting.id, user.id))) {
    const loaded = await loadOwn(user, waiting.payload.saId);
    if (loaded.ok) return askConfirmFile(ctx, loaded.sa, file);
  }

  const sas = await openAssignments(user.student.id);
  if (sas.length === 0) return ctx.reply("You have no open homework right now.", { reply_markup: openAppKeyboard("Open my work") });
  if (sas.length === 1) return askConfirmFile(ctx, sas[0], file);

  const action = await createPending(user.id, FILE_WHICH, { saIds: sas.map((s) => s.id), file }, STUDENT_PENDING_MINUTES);
  const kb = new InlineKeyboard();
  for (const sa of sas.slice(0, 4)) kb.text(shortLabel(sa), callbackData(CB.fileFor, action.id, sa.id)).row();
  kb.text("It's a doubt", callbackData(CB.fileDoubt, action.id));
  return ctx.reply("Which homework is this for?", { reply_markup: kb });
}

async function askConfirmFile(ctx: BotContext, sa: OwnSA, file: IncomingFile) {
  const action = await createPending(ctx.appUser.id, FILE_CONFIRM, { saId: sa.id, saIds: [sa.id], file }, STUDENT_PENDING_MINUTES);
  return ctx.reply(`Submit this for ${assignmentLabel(sa.assignment)}?`, {
    reply_markup: new InlineKeyboard()
      .text("Yes, submit", callbackData(CB.fileYes, action.id))
      .text("No, it's a doubt", callbackData(CB.fileDoubt, action.id)),
  });
}

async function submitFile(ctx: BotContext, saId: string, file: IncomingFile) {
  const r = await submitWork(ctx.appUser, saId, {
    kind: file.kind,
    text: file.caption,
    file: { fileId: file.fileId, fileUniqueId: file.fileUniqueId, fileName: file.fileName, mimeType: file.mimeType },
  });
  if ("ok" in r) return edit(ctx, EXPIRED);
  return edit(ctx, submitReply(r));
}

/** fy:<pendingId> [Yes, submit] */
export async function handleFileYes(ctx: BotContext, pendingId: string) {
  const action = await consumePending<{ saId: string; file: IncomingFile }>(pendingId, ctx.appUser.id);
  if (!action || action.kind !== FILE_CONFIRM) return ctx.answerCallbackQuery({ text: EXPIRED });
  return submitFile(ctx, action.payload.saId, action.payload.file);
}

/** sf:<pendingId>:<saId>: picked the homework (for a submission, or for a doubt). */
export async function handleFileFor(ctx: BotContext, pendingId: string, saId: string) {
  const action = await consumePending<{ saIds: string[]; file: IncomingFile }>(pendingId, ctx.appUser.id);
  if (!action || !action.payload.saIds.includes(saId)) return ctx.answerCallbackQuery({ text: EXPIRED });
  if (action.kind === FILE_WHICH) return submitFile(ctx, saId, action.payload.file);
  if (action.kind === FILE_DOUBT_WHICH) return sendFileDoubt(ctx, saId, action.payload.file);
  return ctx.answerCallbackQuery({ text: EXPIRED });
}

/** sd:<pendingId> [It's a doubt] / [No, it's a doubt] */
export async function handleFileDoubt(ctx: BotContext, pendingId: string) {
  const action = await consumePending<{ saIds: string[]; file: IncomingFile }>(pendingId, ctx.appUser.id);
  if (!action || (action.kind !== FILE_CONFIRM && action.kind !== FILE_WHICH)) return ctx.answerCallbackQuery({ text: EXPIRED });
  const { saIds, file } = action.payload;
  if (saIds.length === 1) return sendFileDoubt(ctx, saIds[0], file);

  const sas = (await openAssignments(ctx.appUser.student!.id)).filter((sa) => saIds.includes(sa.id));
  const next = await createPending(ctx.appUser.id, FILE_DOUBT_WHICH, { saIds, file }, STUDENT_PENDING_MINUTES);
  const kb = new InlineKeyboard();
  for (const sa of sas.slice(0, 4)) kb.text(shortLabel(sa), callbackData(CB.fileFor, next.id, sa.id)).row();
  return edit(ctx, "Which homework is your doubt about?", { reply_markup: kb });
}

async function sendFileDoubt(ctx: BotContext, saId: string, file: IncomingFile) {
  const loaded = await loadOwn(ctx.appUser, saId);
  if (!loaded.ok) return edit(ctx, EXPIRED);
  await addFileDoubt(ctx.appUser, loaded.sa, { kind: file.kind, fileId: file.fileId, caption: file.caption });
  return edit(ctx, `Sent to your teacher as a doubt about ${loaded.label} ✓`);
}
