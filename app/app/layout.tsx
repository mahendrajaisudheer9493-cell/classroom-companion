import Script from "next/script";
import { TelegramInit } from "@/app/app/_components/telegram-init";

// Mini App shell: loads Telegram's WebApp script (initData, theme variables, native dialogs).
export default function MiniAppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="min-h-dvh bg-app text-tg-text">
      <Script src="https://telegram.org/js/telegram-web-app.js" />
      <TelegramInit />
      <main className="mx-auto w-full max-w-[480px] px-4 pb-24 pt-4">{children}</main>
    </div>
  );
}
