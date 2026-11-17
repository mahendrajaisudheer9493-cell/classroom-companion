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
- 2026-11-17 · `canViewStudentAssignment` returns "full" for the class teacher; read-only is enforced because every action also requires `canManageClassSubject` · keeps one "what can I see" answer and one "what can I do" answer.
- 2026-11-17 · Unknown class → 404, someone else's class → 403 · existence of a class id isn't sensitive; the 403 is what the access demo shows.
- 2026-11-17 · A Telegram user with no membership and no linked student counts as "not linked" for the Mini App (401 not_linked) · the bot creates a User row on first contact, before they join anything.
- 2026-11-17 · ProcessedUpdate is inserted with `createMany({ skipDuplicates: true })` before handling · a retry is skipped without a noisy P2002 error log; if the handler then fails, the error boundary replies "Something went wrong" and Telegram does not retry (the user taps again).
- 2026-11-17 · Join-flow buttons carry the join code id (`pk:<joinCodeId>:<studentId>`, 54 bytes) and every tap re-checks code validity, class and claim on the server · stale or forged buttons can't link to another class.
- 2026-11-17 · Seed adds a one-use teacher invite `GFSCI8A` (Science teacher, 8A, 30 days) · lets the `t_<CODE>` flow be tested without an invite UI yet.
- 2026-11-17 · The bot overwrites `User.displayName` with the Telegram name on every update (per task spec) · rosters always show `Student.name`, so a student's identity never comes from Telegram.
- 2026-11-17 · Mini App pages are client components that fetch `/api/app/*`; the class page wraps its `useParams` client component in `<Suspense>` · with `cacheComponents` the shell is prerendered and all data stays behind the initData-checked API.
- 2026-11-17 · telegram-web-app.js loads with the default `afterInteractive` strategy in `app/app/layout.tsx`; `apiFetch` waits for `window.Telegram.WebApp` · `beforeInteractive` is only allowed in the root layout.
- 2026-11-17 · Roster shows which Telegram account claimed each name (`linkedAs`) · lets a teacher spot a wrong claim before unlinking.
- 2026-11-17 · Class page has a [Share] button (Telegram share sheet) next to [Copy link] · teachers usually post the link into the class group.
- 2026-11-17 · State machine also allows NEEDS_REVISION → BLOCKED (student stuck on a redo); ACKNOWLEDGE from any state after ASSIGNED keeps the status · DESIGN §4 needs stuck on a revision and re-acknowledging a change without losing progress.
- 2026-11-17 · LLM calls use forced `tool_choice` on Claude Haiku 5.5 (accepted on this model; it skips thinking for the forced call), no `temperature` (non-default values 400 on Haiku 5.5), one retry on network errors only, `maxRetries: 0` in the SDK · predictable latency under the 8 s budget; timeouts fall back to buttons/form immediately.
- 2026-11-17 · The teacher-parse prompt includes a 15-day calendar with weekdays · date arithmetic is the model's weakest spot; giving it the calendar turns "day after"/"Monday" into a lookup.
- 2026-11-17 · Known ambiguity: "next Friday" sometimes resolves to the Friday of next week (eval case 8) · genuinely ambiguous in Indian English; safe because the teacher always sees the exact date in the preview before [Send].
- 2026-11-17 · sendDue claims each row by moving its `sendAfter` 2 minutes ahead (conditional update) before sending · tick and webhook can run sendDue at once without double sends and without a SENDING status; a crash mid-send retries after 2 minutes.
- 2026-11-17 · Telegram 400 (e.g. chat not found) is DEAD like 403, not retried · a bad request won't succeed on retry; 429 honours retry_after; other errors back off 2^attempts minutes, DEAD after 6.
- 2026-11-17 · Outbound payload carries `meta { assignmentId, studentAssignmentId }` · side effects on send (deliveredAt) and cleanup on cancel without extra columns.
- 2026-11-17 · JobLease is taken with one `INSERT … ON CONFLICT DO UPDATE … WHERE lockedUntil < now` and released at the end of the tick · atomic, no overlapping ticks, self-heals after 55 s if a tick dies.
