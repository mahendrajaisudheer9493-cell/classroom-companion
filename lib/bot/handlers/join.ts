import { GrammyError } from "grammy";
import type { BotContext } from "@/lib/bot/context";
import { openAppKeyboard, pickStudentKeyboard } from "@/lib/bot/keyboards";
import { T } from "@/lib/bot/texts";
import { deliverPendingAssignments } from "@/lib/domain/delivery";
import { claimStudent, listUnclaimedStudents, lookupJoinCodeById } from "@/lib/domain/linking";
import { logEvent } from "@/lib/log";

type EditExtra = Parameters<BotContext["editMessageText"]>[1];

/** Edit the tapped message. A double tap can try the same edit twice; Telegram's "not modified" is harmless. */
async function edit(ctx: BotContext, text: string, extra?: EditExtra) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    if (err instanceof GrammyError && err.description.includes("message is not modified")) return;
    throw err;
  }
}

// Callback handlers for the student join flow. Each one re-checks everything on the server
// (code still valid, student in that class, unclaimed), so stale or forged buttons do nothing harmful.

/** [Yes] on "You're joining 8A, Greenfield. Correct?" → list unclaimed names. */
export async function handleJoinYes(ctx: BotContext, joinCodeId: string) {
  const lookup = await lookupJoinCodeById(joinCodeId);
  if (lookup.status !== "ok") return edit(ctx, T.codeExpired);

  const linked = ctx.appUser.student;
  if (linked) return edit(ctx, T.alreadyLinked(linked.name, linked.class.name));

  const students = await listUnclaimedStudents(lookup.joinCode.classId);
  if (students.length === 0) return edit(ctx, T.everyoneLinked);
  return edit(ctx, T.whoAreYou, { reply_markup: pickStudentKeyboard(joinCodeId, students) });
}

/** [No] → nothing linked. */
export async function handleJoinNo(ctx: BotContext) {
  return edit(ctx, T.joinCancelled);
}

/** A name was picked → claim it (one transaction), then deliver any published work. */
export async function handlePickStudent(ctx: BotContext, joinCodeId: string, studentId: string) {
  const result = await claimStudent(ctx.appUser.id, joinCodeId, studentId);
  if (!result.ok) {
    if (result.reason === "already_linked") return edit(ctx, T.alreadyLinked(result.name, result.className));
    if (result.reason === "name_taken") return edit(ctx, T.nameTaken);
    return edit(ctx, T.codeExpired); // code_invalid / wrong_class
  }

  const { student } = result;
  await logEvent(
    "student.linked",
    { studentId: student.id, studentName: student.name, telegramId: ctx.appUser.telegramId },
    { schoolId: student.schoolId, classId: student.classId, actorUserId: ctx.appUser.id },
  );
  await edit(ctx, T.linked(student.name, student.className), {
    reply_markup: openAppKeyboard("Open my work"),
  });
  await deliverPendingAssignments(student.id);
}
