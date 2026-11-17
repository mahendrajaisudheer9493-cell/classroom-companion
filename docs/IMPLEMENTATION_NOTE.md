# Implementation note

## Assumptions
- One school pilot (Greenfield, 8A and 8B), IST.
- Students use Telegram, sometimes on a family phone. One account links to one student.
- Teachers type homework and confirm a preview.
- Free tiers: Vercel Hobby, Supabase, Claude Haiku 5.5.

## Domain and access model
Schools have classes with roster entries (`Student`). A Telegram account (`User`) links through a class code: the student confirms the class, then picks an unclaimed name. Roles live on memberships, so one person can hold several.

`lib/access` decides access with pure functions, checked on the server in every bot handler and API route:
- **Subject teacher:** acts on their own subject and classes.
- **Class teacher:** reads the class (tabs: Roster, Load, Struggling) but can't act.
- **Coordinator:** sees names and statuses (school health) and runs setup (classes, invites, class teachers) for their school only.
- **Student:** sees only their own work.

A student's work page is open to the student, their class teacher and their subject teachers (own subjects only). Every Mini App request carries Telegram's signed `initData`, checked by HMAC and a 24-hour limit. Refusals are 403/401 and are logged as `access.denied`.

## State model
Status lives per student on `StudentAssignment`: ASSIGNED → ACKNOWLEDGED → IN_PROGRESS ⇄ BLOCKED → SUBMITTED → COMPLETED or NEEDS_REVISION. Only `state-machine.ts` changes it; illegal transitions throw, and repeats are no-ops. Overdue, silent and "hasn't seen the change" are computed. Triage, struggling, school health and "at risk" all reuse the same predicates, so their numbers agree. A change bumps the version and needs a new acknowledgement.

## Reminder policy
`computeDueReminders(now, rows, settings)` is pure:
- **Silent:** "did you see it?"
- **Working:** "due tomorrow" from 18:00 the day before.
- **Stuck:** only "still stuck?" the next morning.
- **Overdue:** "was due" at 07:00 the next day.

Nothing is evaluated 21:00–07:00. A unique `ReminderFired` key, written with the message, stops repeats. One student's reminders merge into one message. The model may word single reminders; text with a link or another student's name falls back to a template. Teachers get a 07:30 digest and can ask "who is at risk?"; the model words code-computed facts only.

## Failures handled
- **Model** timeout, error or invalid output: buttons or the app form, logged as `model.failure`. Confidence below 0.7: the bot asks.
- **Telegram down:** messages stay queued with backoff; DEAD after 6 tries.
- **Duplicates:** repeated updates are skipped through `ProcessedUpdate`; double taps re-check status or use one-time actions.
- **Restarts:** jobs are database rows; a lease stops overlapping ticks.
- **Wrong context:** other classes, students and schools, and forged sign-ins, are refused.
- **Bad codes:** wrong, expired or claimed codes link nothing.

## What I'd improve next
1. An overload warning when a teacher adds work to a heavy day.
2. Sibling accounts and transfers.
3. Asking which Friday "next Friday" means.
4. A weekly "at risk" summary for class teachers.
5. A local long-polling bot script.
6. Tracking the known-status rate.
