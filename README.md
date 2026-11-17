# Classroom Companion

A Telegram bot + Telegram Mini App that helps teachers assign work, follow up with students and see who needs attention. Students get a private one-tap **Got it / I'm stuck / Done**; teachers get a morning triage board; the coordinator sees which classes are falling behind.

Design: [docs/DESIGN.md](docs/DESIGN.md) · PRD: [docs/PRD.md](docs/PRD.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

> Status: scaffold, database schema and demo seed. Bot and Mini App features are not built yet.

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

Checks: `npm run typecheck && npm test && npm run lint`

## Test accounts

The demo uses three Telegram accounts:

| Account | Plays | Set up by |
| --- | --- | --- |
| A, `SEED_TEACHER_TELEGRAM_ID` | Mrs. Lakshmi Rao: Maths teacher in 8A + 8B, class teacher of 8A, **and** coordinator (unless `SEED_COORDINATOR_TELEGRAM_ID` is set) | seed |
| B, `SEED_STUDENT_TELEGRAM_ID` | Ravi Kumar, 8A, roll 1: already linked | seed |
| C, any other account | Anu Reddy, 8A, roll 2: links **live** with class code `GF8A` (`t.me/<bot>?start=c_GF8A`) | demo |

Each account must send `/start` to the bot once so the bot is allowed to message it.

Also seeded: Mr. Arjun Das (fake account) with a published English assignment in 8B, which the Maths teacher must not see; the expired code `GF8A-OLD`; and a second school, Riverside School (7A), to show cross-school isolation.
