"use client";

import { CloudOff, House, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/app/app/_lib/client-error";

// Mini App error boundary: shows a calm screen with a retry, and sends the real error (message,
// stack, page, Telegram version) to /api/client-error so it appears in the logs as `client.error`.
export default function MiniAppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { source: "error-boundary" });
  }, [error]);

  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="tinted tone-neutral mb-3 flex h-14 w-14 items-center justify-center rounded-full">
        <CloudOff aria-hidden size={26} />
      </span>
      <h1 className="text-headline font-semibold">This screen hit a problem</h1>
      <p className="mt-1 max-w-xs text-body text-tg-hint">It has been reported. Try again, or go back to the home screen.</p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text active:opacity-70"
        >
          <RotateCcw aria-hidden size={18} /> Try again
        </button>
        <Link href="/app" className="tinted tone-accent inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 font-semibold active:opacity-70">
          <House aria-hidden size={18} /> Home
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-caption text-tg-hint">Error code {error.digest}</p>}
    </div>
  );
}
