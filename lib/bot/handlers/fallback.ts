import type { BotContext } from "@/lib/bot/context";
import { openAppKeyboard } from "@/lib/bot/keyboards";
import { T } from "@/lib/bot/texts";
import { isLinked } from "@/lib/auth/user";
import { handleTeacherText } from "@/lib/bot/handlers/teacher";
import { teachingSlots } from "@/lib/domain/assignments";

/** Any message no other handler took. Unlinked users are told how to join. */
export async function handleOtherMessage(ctx: BotContext) {
  if (!isLinked(ctx.appUser)) return ctx.reply(T.askTeacher);
  const text = ctx.message?.text;
  // Teachers create, change and cancel assignments by typing.
  if (text && !text.startsWith("/") && teachingSlots(ctx.appUser).length > 0) return handleTeacherText(ctx, text);
  // Free-text understanding (stuck / done / submissions) arrives in a later task.
  const label = ctx.appUser.memberships.length > 0 ? "Open app" : "Open my work";
  return ctx.reply(T.notYet, { reply_markup: openAppKeyboard(label) });
}

export async function handleHelp(ctx: BotContext) {
  return ctx.reply(T.help);
}
