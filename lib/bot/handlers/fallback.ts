import type { BotContext } from "@/lib/bot/context";
import { openAppKeyboard } from "@/lib/bot/keyboards";
import { T } from "@/lib/bot/texts";
import { isLinked } from "@/lib/auth/user";
import { handleStudentText } from "@/lib/bot/handlers/student-text";
import { handleTeacherText } from "@/lib/bot/handlers/teacher";
import { teachingSlots } from "@/lib/domain/assignments";

/** Any message no other handler took. Unlinked users are told how to join. */
export async function handleOtherMessage(ctx: BotContext) {
  if (!isLinked(ctx.appUser)) return ctx.reply(T.askTeacher);
  const text = ctx.message?.text;
  if (text && !text.startsWith("/")) {
    // Both roles: anyone who teaches a subject is read as a teacher; otherwise a linked student.
    if (teachingSlots(ctx.appUser).length > 0) return handleTeacherText(ctx, text);
    if (ctx.appUser.student) return handleStudentText(ctx, text);
  }
  const label = ctx.appUser.memberships.length > 0 ? "Open app" : "Open my work";
  return ctx.reply(T.notYet, { reply_markup: openAppKeyboard(label) });
}

export async function handleHelp(ctx: BotContext) {
  return ctx.reply(T.help);
}
