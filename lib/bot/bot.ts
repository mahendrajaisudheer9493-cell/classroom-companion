import { Bot, type NextFunction } from "grammy";
import { appUserInclude } from "@/lib/auth/user";
import type { BotContext } from "@/lib/bot/context";
import { handleHelp, handleOtherMessage } from "@/lib/bot/handlers/fallback";
import { handleJoinNo, handleJoinYes, handlePickStudent } from "@/lib/bot/handlers/join";
import { handleStart } from "@/lib/bot/handlers/start";
import { CB } from "@/lib/bot/keyboards";
import { T } from "@/lib/bot/texts";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";

// ───────────── Middleware (runs in this order for every update) ─────────────

/** Catches every error: log it, tell the user, never let Telegram retry a half-done update. */
async function errorBoundary(ctx: BotContext, next: NextFunction) {
  try {
    await next();
  } catch (err) {
    await logEvent(
      "bot.error",
      { updateId: ctx.update.update_id, error: err },
      { schoolId: ctx.appUser?.memberships[0]?.schoolId ?? ctx.appUser?.student?.schoolId, actorUserId: ctx.appUser?.id },
    );
    if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
    if (ctx.chat) await ctx.reply(T.error).catch(() => {});
  }
}

/** (a) The bot is 1:1 only: ignore groups and channels. */
async function privateChatsOnly(ctx: BotContext, next: NextFunction) {
  if (ctx.chat?.type === "private" && ctx.from) await next();
}

/** (b) Idempotency: record the update_id first; a repeat (Telegram retry) is skipped silently. */
async function dedupeUpdates(ctx: BotContext, next: NextFunction) {
  // ON CONFLICT DO NOTHING: count is 0 when this update_id was already processed.
  const inserted = await prisma.processedUpdate.createMany({
    data: [{ updateId: BigInt(ctx.update.update_id) }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return;
  await next();
}

/** (c) + (d) Upsert the Telegram account and attach memberships + linked student. */
async function loadUser(ctx: BotContext, next: NextFunction) {
  const from = ctx.from!;
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ");
  const profile = { telegramUsername: from.username ?? null, displayName, chatId: BigInt(ctx.chat!.id) };
  ctx.appUser = await prisma.user.upsert({
    where: { telegramId: BigInt(from.id) },
    update: profile,
    create: { telegramId: BigInt(from.id), ...profile },
    include: appUserInclude,
  });
  await next();
}

/** Every callback query gets answered (stops the spinner), even if a handler forgot to. */
async function alwaysAnswerCallbacks(ctx: BotContext, next: NextFunction) {
  if (!ctx.callbackQuery) return next();
  let answered = false;
  const answer = ctx.answerCallbackQuery.bind(ctx);
  ctx.answerCallbackQuery = ((...args: Parameters<typeof answer>) => {
    answered = true;
    return answer(...args);
  }) as typeof ctx.answerCallbackQuery;
  try {
    await next();
  } finally {
    if (!answered) await answer().catch(() => {});
  }
}

// ───────────────────────────── Bot ─────────────────────────────

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  bot.use(errorBoundary, privateChatsOnly, dedupeUpdates, loadUser, alwaysAnswerCallbacks);

  bot.command("start", handleStart);
  bot.command("help", handleHelp);

  bot.callbackQuery(new RegExp(`^${CB.joinYes}:(\\w+)$`), (ctx) => handleJoinYes(ctx, ctx.match[1]));
  bot.callbackQuery(CB.joinNo, handleJoinNo);
  bot.callbackQuery(new RegExp(`^${CB.pick}:(\\w+):(\\w+)$`), (ctx) => handlePickStudent(ctx, ctx.match[1], ctx.match[2]));
  bot.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: T.buttonExpired }));

  bot.on("message", handleOtherMessage);

  // Only reached in long-polling mode (errorBoundary handles webhook updates).
  bot.catch((err) => console.error(JSON.stringify({ event: "bot.unhandled", error: String(err.error) })));
  return bot;
}

let bot: Bot<BotContext> | undefined;

/** One Bot per cold start (grammY fetches getMe once, on the first update). */
export function getBot(): Bot<BotContext> {
  bot ??= createBot(getEnv().TELEGRAM_BOT_TOKEN);
  return bot;
}
