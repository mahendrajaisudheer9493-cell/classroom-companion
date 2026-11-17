import type { ReactNode } from "react";

// Small building blocks styled with Telegram theme colours.

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-tg-hint">{title}</h2>
      <div className="overflow-hidden rounded-xl bg-tg-secondary-bg">{children}</div>
    </section>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3 border-b border-tg-hint/15 px-4 py-3 last:border-b-0">{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-tg-button text-tg-button-text",
    secondary: "bg-tg-bg text-tg-link",
    danger: "bg-tg-bg text-tg-destructive",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-medium active:opacity-70 disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Loading() {
  return <p className="py-10 text-center text-tg-hint">Loading…</p>;
}

/** Shown when the API says we're not linked, or we're outside Telegram, or something failed. */
export function Notice({ error, message }: { error: string; message: string }) {
  if (error === "not_linked") {
    return (
      <div className="py-8">
        <h1 className="mb-3 text-xl font-semibold">You haven&apos;t joined a class yet</h1>
        <ol className="list-decimal space-y-2 pl-5 text-tg-hint">
          <li>Ask your teacher for your class link.</li>
          <li>Open the link in Telegram. It starts a chat with the Classroom Companion bot.</li>
          <li>Confirm your class and tap your name.</li>
          <li>Come back here with the bot&apos;s Open button.</li>
        </ol>
      </div>
    );
  }
  if (error === "unauthorized") {
    return (
      <div className="py-8">
        <h1 className="mb-3 text-xl font-semibold">Open this in Telegram</h1>
        <p className="text-tg-hint">
          Classroom Companion runs inside Telegram. Open the Classroom Companion bot and tap Open.
        </p>
      </div>
    );
  }
  return (
    <div className="py-8">
      <h1 className="mb-3 text-xl font-semibold">{error === "forbidden" ? "Not allowed" : "Something went wrong"}</h1>
      <p className="text-tg-hint">{message}</p>
    </div>
  );
}
