import type { BotContext } from "@/lib/bot/context";
import { acknowledge } from "@/lib/domain/acknowledge";

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

/** [I'm stuck] and [Done] arrive in Task 4. */
export async function handleComingSoon(ctx: BotContext) {
  return ctx.answerCallbackQuery({ text: "Coming soon" });
}
