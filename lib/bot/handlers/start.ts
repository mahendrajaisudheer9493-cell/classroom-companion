import type { BotContext } from "@/lib/bot/context";
import { confirmJoinKeyboard, openAppKeyboard } from "@/lib/bot/keyboards";
import { roleLabel, T } from "@/lib/bot/texts";
import { deliverPendingAssignments } from "@/lib/domain/delivery";
import { acceptTeacherInvite, lookupJoinCode } from "@/lib/domain/linking";
import { logEvent } from "@/lib/log";

/** /start, /start c_<CODE> (class link), /start t_<CODE> (teacher invite). */
export async function handleStart(ctx: BotContext) {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (payload.startsWith("c_")) return handleClassLink(ctx, payload.slice(2));
  if (payload.startsWith("t_")) return handleTeacherInvite(ctx, payload.slice(2));
  return handlePlainStart(ctx);
}

async function handleClassLink(ctx: BotContext, code: string) {
  const lookup = await lookupJoinCode(code);
  if (lookup.status === "unknown") return ctx.reply(T.codeUnknown);
  if (lookup.status === "expired") return ctx.reply(T.codeExpired);

  const linked = ctx.appUser.student;
  if (linked) return ctx.reply(T.alreadyLinked(linked.name, linked.class.name));

  const { joinCode } = lookup;
  return ctx.reply(T.confirmJoin(joinCode.class.name, joinCode.class.school.name), {
    reply_markup: confirmJoinKeyboard(joinCode.id),
  });
}

async function handleTeacherInvite(ctx: BotContext, code: string) {
  const result = await acceptTeacherInvite(ctx.appUser.id, code);
  if (!result.ok) {
    const text = { unknown: T.inviteUnknown, used: T.inviteUsed, expired: T.inviteExpired, invalid: T.inviteInvalid }[result.reason];
    return ctx.reply(text);
  }
  await logEvent(
    "teacher.joined",
    { grants: result.grants },
    { schoolId: result.schoolId, actorUserId: ctx.appUser.id },
  );
  const roles = result.grants.map((g) => roleLabel(g, result.schoolName));
  return ctx.reply(T.inviteAccepted(result.schoolName, roles), { reply_markup: openAppKeyboard() });
}

async function handlePlainStart(ctx: BotContext) {
  const { memberships, student, displayName } = ctx.appUser;
  if (memberships.length > 0) await ctx.reply(T.welcomeStaff(displayName), { reply_markup: openAppKeyboard() });
  else if (student) await ctx.reply(T.welcomeStudent(student.name), { reply_markup: openAppKeyboard("Open my work") });
  else return ctx.reply(T.askTeacher);
  // A pre-linked student (seed) only gets a chat id on /start: deliver anything published meanwhile.
  if (student) await deliverPendingAssignments(student.id);
}
