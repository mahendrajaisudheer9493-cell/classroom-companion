# Decisions

Changes to or clarifications of docs/DESIGN.md. One line each: date · decision · why.

- 2026-11-17 · Prisma pinned to 6.x (6.19.3), not 7+ · Prisma 7 removes `url`/`directUrl` from schema.prisma; 6.x keeps the documented Supabase pooled + direct URL setup.
- 2026-11-17 · `@types/node` ^22 (scaffold had ^20) · vitest 5 requires it; local Node is 22.
- 2026-11-17 · TypeScript target ES2020 (scaffold had ES2017) · Telegram IDs are BigInt and BigInt literals need ES2020.
- 2026-11-17 · `typecheck` runs `next typegen` before `tsc --noEmit` · Next 16 generates route types such as `LayoutProps`; without them tsc fails on a clean checkout.
- 2026-11-17 · Env is validated lazily via `getEnv()`, not at import; the seed validates only `SEED_*` vars · `next build`, tests and seeding work without every secret filled in.
- 2026-11-17 · Membership's unique key has nullable classId/subject, and Postgres treats NULLs as distinct · code finds-or-creates memberships instead of relying on the constraint for coordinator/class-teacher rows.
- 2026-11-17 · Seeded users have `chatId` null until they send /start · Telegram only lets a bot message users who started it.
- 2026-11-17 · `/api/health` calls `connection()` · `cacheComponents` is on in next.config; this guarantees the DB check runs per request, never at build.
