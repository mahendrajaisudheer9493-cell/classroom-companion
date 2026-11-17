# Implementation note

## Assumptions
- One school pilot (Greenfield, 8A and 8B), all times IST.
- Students use Telegram, sometimes on a shared family phone. One account links to one student.
- Teachers set homework by typing and confirm a preview first.
- Free tiers: Vercel Hobby (60 s functions), Supabase Postgres, Claude Haiku 5.5.

## Domain and access model
A school has classes with roster entries (`Student`). A Telegram account (`User`) links to a roster entry through a class code: the student confirms the class, then picks an unclaimed name. Roles sit on memberships (subject teacher of class + subject, class teacher, coordinator), so one person can hold several.

`lib/access` decides access with pure functions, enforced on the server in every bot handler and API route:
- **Subject teacher:** acts on their own subject in their own classes.
- **Class teacher:** reads their class but can't act.
- **Coordinator:** sees names and statuses only.
- **Student:** sees only their own work.

Every Mini App request carries Telegram's signed `initData`, checked by HMAC and a 24-hour age limit. Refusals are 403/401 and are logged as `access.denied`.

## State model
Status lives on `StudentAssignment`, per student: ASSIGNED → ACKNOWLEDGED → IN_PROGRESS ⇄ BLOCKED → SUBMITTED → COMPLETED or NEEDS_REVISION. Only `state-machine.ts` changes it; illegal transitions throw, and repeats are no-ops. Overdue, silent and "hasn't seen the change" are computed, not stored. A change bumps the version and needs a new acknowledgement.

## Reminder policy
`computeDueReminders(now, rows, settings)` is a pure function:
- **Silent:** "did you see it?"
- **Working:** "due tomorrow" from 18:00 the day before.
- **Stuck:** only "still stuck?" the next morning, never a submit reminder.
- **Overdue:** "was due" at 07:00 the next day.

Nothing is evaluated 21:00–07:00. Each reminder's unique `ReminderFired` key is written in the same transaction as its message, so reruns never repeat it. One student's reminders merge into one message. The model may word single reminders; text with a link or another student's name falls back to a template. Teachers get a 07:30 digest built from the triage counts.

## Failures handled
- **Model** timeout, error or invalid output: buttons or the app form, logged as `model.failure`. Confidence below 0.7: the bot asks.
- **Telegram down:** messages stay queued with backoff and become DEAD after 6 tries.
- **Duplicates:** repeated updates are skipped through `ProcessedUpdate`; double taps re-check status or use one-time actions; the same file twice is one submission.
- **Restarts:** jobs are database rows, and a lease stops overlapping ticks.
- **Wrong context:** other classes, other students and forged sign-ins are refused.
- **Bad codes:** wrong, expired or claimed codes get a clear message, and nothing is linked.

## What I'd improve next
1. Class-teacher views and the coordinator's school health page (their access rules already exist and are tested).
2. An invite screen.
3. Sibling accounts and transfers.
4. Asking which Friday "next Friday" means.
5. A local long-polling bot script.
6. Tracking the known-status rate.
