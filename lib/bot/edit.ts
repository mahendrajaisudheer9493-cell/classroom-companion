import { GrammyError } from "grammy";
import type { BotContext } from "@/lib/bot/context";

type EditExtra = Parameters<BotContext["editMessageText"]>[1];

/** Edit the tapped message. A double tap can try the same edit twice; Telegram's "not modified" is harmless. */
export async function edit(ctx: BotContext, text: string, extra?: EditExtra) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    if (err instanceof GrammyError && err.description.includes("message is not modified")) return;
    throw err;
  }
}
