# Classroom Companion — instructions for Claude Code

Telegram bot + Telegram Mini App that helps teachers assign work, follow up with students and see who needs attention. Take-home assignment for Super Intelli Machines; graded on product judgment, a working end-to-end slice, LLM judgment, trust/operations and clear reasoning.

**Before any work, read `docs/DESIGN.md` (source of truth) and `docs/PRD.md`.** If something is ambiguous, pick the simplest option consistent with DESIGN.md and record it in `docs/DECISIONS.md` (one line: date, decision, why).

## Stack
- Next.js (App Router, TypeScript strict) deployed on Vercel Hobby
- grammY bot inside `app/api/telegram/route.ts` (webhook); `scripts/dev-bot.ts` runs long-polling locally
- Supabase Postgres + Prisma (`DATABASE_URL` pooled :6543 with `?pgbouncer=true&connection_limit=1`; `DIRECT_URL` :5432 for migrations)
- Supabase pg_cron + pg_net calls `POST /api/tick` every minute
- Claude Haiku 5.5 (`claude-haiku-5-5`) via `@anthropic-ai/sdk`, forced tool use, validated with zod
- Luxon for all time logic, zone `Asia/Kolkata`
- Tailwind for UI; use Telegram theme CSS variables (`--tg-theme-*`) so it looks native
- Vitest for tests

## Folder layout
```
app/app/...            Mini App pages (role-aware home at /app)
app/api/telegram       bot webhook
app/api/tick           scheduler entry (Bearer CRON_SECRET)
app/api/app/...        Mini App JSON API (initData auth on every request)
app/api/files/[id]     submission file preview (after access check)
app/api/health         health check
lib/env.ts             zod-validated env
lib/db.ts              Prisma client singleton
lib/log.ts             structured JSON logs + ActivityEvent writes
lib/time.ts            IST helpers, quiet hours, time-of-day mapping
lib/auth/              Telegram initData validation, current-user resolution
lib/access/            THE access module — every route/handler calls it
lib/domain/            state machine, assignments, submissions, feedback, doubts, triage, digest, reminders, linking
lib/bot/               grammY bot, handlers, keyboards, callback data
lib/llm/               client, schemas, parse-assignment, interpret-student, phrase
lib/queue/             outbound queue + sender
prisma/                schema.prisma, seed.ts
scripts/               set-webhook.ts, dev-bot.ts, supabase-cron.sql, tick.ts, demo scripts
tests/                 vitest; tests/evals/*.json for LLM evals
```

## Non-negotiables
1. **Access is enforced on the server** through `lib/access` in every bot handler and API route. Never rely on hiding UI.
2. **Mini App identity** = Telegram `initData` validated with HMAC on every API request (`Authorization: tma <initData>`), `auth_date` max age 24 h. Dev-only bypass `DEV_AUTH_TELEGRAM_ID` works only when `NODE_ENV !== "production"`.
3. **Idempotency:** insert `ProcessedUpdate(update_id)` first and skip on conflict; callback actions must be safe to repeat; unique keys on outbound messages and fired reminders.
4. **Status changes only through `lib/domain/state-machine.ts`**; illegal transitions throw.
5. **All notifications go through the OutboundMessage queue** (quiet hours 21:00–07:00 IST for students, retries with backoff). Direct replies to a user's own action in the same request are allowed.
6. **LLM output is never trusted:** forced tool use → zod → IDs must be from the candidates passed in → confidence ≥ threshold, else ask with buttons. Teacher confirms every assignment/change/cancel. Numbers come from code. Log `model.failure` on any failure.
7. **Required log events** (JSON line + ActivityEvent): `assignment.created`, `reminder.sent`, `submission.received`, `feedback.sent`, `model.failure`, plus `access.denied`.
8. Telegram callback_data ≤ 64 bytes: use short prefixes + ids, or a `PendingAction` id for anything bigger.
9. **No secrets in git.** Keep `.env.example` complete and up to date.
10. Keep code simple and readable — the author must change it live in an interview.

## Commands
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm test` · `npm run lint`
- `npx prisma migrate dev` · `npm run db:seed` · `npm run db:reset` (reset + seed)
- `npm run bot:dev` (local long-polling) · `npm run webhook:set` · `npm run tick` · `npm run eval`

## Working style
- Small, intentional commits with clear messages (history is graded). Commit at the end of each task.
- After each task: run `npm run typecheck && npm test`, fix failures, then summarise what changed and give manual test steps.
