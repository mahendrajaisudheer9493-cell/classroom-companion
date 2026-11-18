import { cn } from "./cn";

// Initials on a colour picked from the name (stable), white text: readable in both themes.

const COLORS = ["#e17076", "#eda86c", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae", "#d29c58"];

export function initials(name: string): string {
  if (/^\S{1,3}$/.test(name.trim())) return name.trim().toUpperCase(); // class names like "8A"
  const parts = name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}
