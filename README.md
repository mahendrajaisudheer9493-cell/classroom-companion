# Classroom Companion

A Telegram bot + Telegram Mini App that helps teachers assign work, follow up with students and see who needs attention. Students get a private one-tap **Got it / I'm stuck / Done**; teachers get a morning triage board; the coordinator sees which classes are falling behind.

Design: [docs/DESIGN.md](docs/DESIGN.md) · PRD: [docs/PRD.md](docs/PRD.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

> Status: linking, Mini App sign-in, access control, rosters, and assignments by chat (create / change / cancel with preview + confirm), the outbound queue with quiet hours, the minute tick, and student cards with [Got it]. Students reply in chat (got it / progress / stuck / done, free text understood by the model with button fallbacks), submit by photo, file, text or in class, and teachers get real-time doubt alerts. Reminders, triage and review come next.

## Prerequisites

- Node.js 22+ and npm
- A Supabase project (Postgres)
- A Telegram bot from [@BotFather](https://t.me/BotFather)
- An Anthropic API key
- Your Telegram numeric user IDs (message [@userinfobot](https://t.me/userinfobot))

## Setup

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # fill in every value; comments explain each one
npm run db:migrate          # apply migrations (uses DIRECT_URL)
npm run db:seed             # demo data; safe to run twice
npm run dev                 # http://localhost:3000
curl localhost:3000/api/health   # → { "ok": true, "db": true, "time": "...IST" }
```

`npm run db:reset` drops all data, re-applies migrations and re-seeds.

Checks: `npm run typecheck && npm test && npm run lint`. `npm test` mocks the model and Telegram; the tests in `tests/integration` use the database in `.env` with a throwaway school they create and delete (skipped without `DATABASE_URL`).

## Deploy to Vercel

1. Import the GitHub repo in Vercel (**Add New → Project**). Framework: Next.js (auto-detected); no build settings to change. `npm install` runs `prisma generate` via `postinstall`.
2. **Settings → Environment Variables**: add every variable from `.env.example` (Production and Preview). Set `APP_URL` to the deployment's https URL, e.g. `https://classroom-companion.vercel.app`. Leave `DEV_AUTH_TELEGRAM_ID` unset (it's ignored in production anyway).
3. Deploy, then open `https://<your-app>/api/health` → `{"ok":true,"db":true,...}`.
4. Vercel doesn't run migrations. After a schema change, run `npm run db:migrate` (dev) or `npx prisma migrate deploy` locally against the same database.

## Set the webhook

Telegram must be told where to send updates. With the **same** `APP_URL` (https), `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in your local `.env` as in Vercel:

```bash
npm run webhook:set
```

This sets the webhook to `APP_URL/api/telegram` (with the secret, only `message` + `callback_query`, pending updates dropped), the bot's menu button **Open** → `APP_URL/app`, and the `/start` `/help` commands, then prints `getWebhookInfo`. Check that `url` is right and `last_error_message` is absent. Re-run it whenever `APP_URL` or the secret changes.

Prove access control on the deployed app: `npm run demo:unauthorized` (or pass a base URL, e.g. `npm run demo:unauthorized -- http://localhost:3000`).

## Scheduler (tick)

`POST /api/tick` (header `Authorization: Bearer <CRON_SECRET>`) runs, in order: student reminders → teacher morning digest → send due queued messages. Teachers can run the same code from the Mini App with **Run reminders now**. Run it by hand with `npm run tick` (or `npm run tick -- http://localhost:3000`).

In production Supabase calls it every minute: open **Supabase → SQL Editor**, paste [scripts/supabase-cron.sql](scripts/supabase-cron.sql), replace `<APP_URL>` and `<CRON_SECRET>`, run. The file also has the queries to check runs and to unschedule.

Set `QUIET_HOURS_ENABLED=false` to test student messages between 21:00 and 07:00 IST.

### Demo mode

Pilot timings are hours apart. For a live demo, set these in Vercel (Settings → Environment Variables) and redeploy:

| Variable | Demo | Pilot |
| --- | --- | --- |
| `SILENT_AFTER_MINUTES` | `2` | `720` |
| `BLOCKED_CHECKIN_AFTER_MINUTES` | `2` | unset (07:00 IST next morning) |
| `DEMO_MODE` | `true` ("was due" 5 min after the deadline) | `false` (07:00 IST next day) |

Reminder rules (each fires once, recorded in `ReminderFired`; nothing to students 21:00–07:00 IST):

| Student | Reminder | When |
| --- | --- | --- |
| ASSIGNED, no activity | "Did you see …?" [Got it] [I'm stuck] | `SILENT_AFTER_MINUTES` after delivery |
| ACKNOWLEDGED / IN_PROGRESS | "… is due tomorrow at …" [Done] [I'm stuck] | from `DUE_SOON_HOUR` (18:00) the day before |
| BLOCKED | only "Still stuck on …?" [Still stuck] [Figured it out] | 07:00 next morning (or `BLOCKED_CHECKIN_AFTER_MINUTES`) |
| not handed in after the deadline | "… was due …" [Submit now] [Bringing it today] [I'm stuck] | 07:00 the day after (5 min in demo mode) |
| SUBMITTED / COMPLETED / NEEDS_REVISION | nothing | |

Several reminders for one student in the same tick become one message.

## LLM evals

`npm run eval` runs [tests/evals/teacher.json](tests/evals/teacher.json) (10 teacher messages, dates relative to a fixed day) against the real model and prints a pass/fail table and accuracy. It costs a fraction of a cent per run and is separate from `npm test`, which never calls the API.

## Test accounts

The demo uses three Telegram accounts:

| Account | Plays | Set up by |
| --- | --- | --- |
| A, `SEED_TEACHER_TELEGRAM_ID` | Mrs. Lakshmi Rao: Maths teacher in 8A + 8B, class teacher of 8A, **and** coordinator (unless `SEED_COORDINATOR_TELEGRAM_ID` is set) | seed |
| B, `SEED_STUDENT_TELEGRAM_ID` | Ravi Kumar, 8A, roll 1: already linked | seed |
| C, any other account | Anu Reddy, 8A, roll 2: links **live** with class code `GF8A` (`t.me/<bot>?start=c_GF8A`) | demo |

Each account must send `/start` to the bot once so the bot is allowed to message it.

To try a teacher invite: `t.me/<bot>?start=t_GFSCI8A` (one use; grants Science teacher in 8A).

Also seeded: Mr. Arjun Das (fake account) with a published English assignment in 8B, which the Maths teacher must not see; the expired code `GF8A-OLD`; and a second school, Riverside School (7A), to show cross-school isolation.
