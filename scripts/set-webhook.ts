// npm run webhook:set: points Telegram at the deployed app and sets the bot's menu button + commands.
// Uses APP_URL, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.
import { config } from "dotenv";
config({ quiet: true });

import { Api } from "grammy";
import { getEnv } from "@/lib/env";

async function main() {
  const env = getEnv();
  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  const webhookUrl = new URL("/api/telegram", env.APP_URL).toString();
  const appUrl = new URL("/app", env.APP_URL).toString();

  await api.setWebhook(webhookUrl, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log(`✓ Webhook set → ${webhookUrl}`);

  await api.setChatMenuButton({ menu_button: { type: "web_app", text: "Open", web_app: { url: appUrl } } });
  console.log(`✓ Menu button "Open" → ${appUrl}`);

  await api.setMyCommands([
    { command: "start", description: "Start or join your class" },
    { command: "help", description: "How this bot works" },
  ]);
  console.log("✓ Commands set: /start, /help");

  const me = await api.getMe();
  const info = await api.getWebhookInfo();
  console.log(`\nBot: @${me.username}`);
  console.log("Webhook info:", JSON.stringify(info, null, 2));
  if (me.username?.toLowerCase() !== env.TELEGRAM_BOT_USERNAME.toLowerCase()) {
    console.warn(`⚠ TELEGRAM_BOT_USERNAME is "${env.TELEGRAM_BOT_USERNAME}" but the token belongs to @${me.username}`);
  }
}

main().catch((err) => {
  console.error("✗ Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
