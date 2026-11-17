# Classroom Companion — Product & System Design

The design behind the one-page PRD (docs/PRD.md). Every decision here is final for the build unless docs/DECISIONS.md records a change.

---

## 1. Domain model

```
School (Greenfield)                         ← tenant boundary; timezone Asia/Kolkata
 ├── Class (8A, 8B; grade 8)
 │     ├── JoinCode (per class; expires; can be regenerated/revoked)
 │     ├── Student (roster entry: name, roll no)  ──linked to at most one──►  User
 │     └── Membership: User + Class + Role (+ Subject)
 │            roles: SUBJECT_TEACHER (needs subject) · CLASS_TEACHER
 ├── Membership: User + School + COORDINATOR
 └── TeacherInvite (one-use, expiring; carries the memberships to grant)

User = a Telegram account. NEVER the student's identity by itself.

Assignment (school + class + subject + created by teacher)
   title, instructions, notes, dueAt, status DRAFT | PUBLISHED | CANCELLED, version
 └── StudentAssignment (one per targeted student)  ← the per-student STATUS lives here
       ackedVersion · deliveredAt · lastStudentActivityAt
       ├── Submission  (TEXT | PHOTO | FILE | IN_CLASS; Telegram file_id, never the file)
       ├── Feedback    (comment + result COMPLETED | NEEDS_REVISION)
       ├── DoubtMessage (private 1:1 thread, student ↔ teacher)
       └── ActivityEvent (append-only log of every interaction)

System tables: OutboundMessage (queue) · ProcessedUpdate (Telegram update_id) ·
               PendingAction (confirm flows) · ReminderFired · JobLease
```

- A roster entry exists before its student links (live scenario: one linked, one not).
- Roles sit on memberships, so one person can be Maths teacher in 8A and 8B, class teacher of 8A, and coordinator.
- Status is per student, never per assignment.
- Every interaction is an ActivityEvent; triage, digest and logs read from it.
- Outgoing messages and reminders are database rows → quiet hours, retries, restart recovery.

## 2. Identity and linking

Identity comes from the class roster, never from the Telegram name (shared family phones).

Students join with **one code per class, then pick their name**, protected by four guards:
1. Tapping the class link (`t.me/<bot>?start=c_<CODE>`) shows "You're joining **8B, Greenfield**. Correct? [Yes] [No]" before anything is linked.
2. Only **unclaimed names** are listed. A student who finds their name taken is told "This name is already linked. Ask your teacher", and the teacher can unlink it in the Mini App.
3. Codes **expire** and the teacher can regenerate them.
4. A mistyped/unknown code → "That code doesn't match any class. Check with your teacher." Anyone who messages the bot before linking is told how to join.

**Pilot limit:** one Telegram account = one student (one User links to at most one Student).

Teachers/coordinator join via a **one-use, expiring TeacherInvite** (`t.me/<bot>?start=t_<CODE>`) that grants its memberships.

After a student links, any already-published assignments for them are delivered (respecting quiet hours).

## 3. Access model

Access follows responsibility.

| Role | Own subject in own classes | Other subjects in own class | Other classes in the school | Other schools |
| --- | --- | --- | --- | --- |
| Subject teacher | Full: create, change, cancel, review, feedback, reply to doubts | None | None | None |
| Class teacher | (as subject teacher, if also one) | Read everything incl. submissions & feedback; no actions | None | None |
| Coordinator | — | Names + statuses; NO submission content or feedback | Names + statuses; NO submission content or feedback | None |
| Student | Only their own assignments, submissions, feedback, doubt threads | | | |

**Enforcement:** one access module (`lib/access`) is called by every bot handler and every Mini App API route. Mini App identity is verified on the server from Telegram's signed `initData` (HMAC). Nothing the browser claims is trusted. Refusals return a clear message and are logged (`access.denied`).

## 4. State model

Per-student states (StudentAssignment.status):

```
                 ┌──────── teacher: "checked in class" (from any open state) ─────────┐
                 │                                                                     ▼
ASSIGNED ──► ACKNOWLEDGED ──► IN_PROGRESS ⇄ BLOCKED ──► SUBMITTED ──► COMPLETED
 (sent/queued)  [Got it]        "half done"   [I'm stuck]     │   ▲
   any open state can go straight to SUBMITTED                ▼   │ resubmit
                                                        NEEDS_REVISION
```

| State | Entered when | By |
| --- | --- | --- |
| ASSIGNED | Assignment published (sent, or queued until the student links) | System |
| ACKNOWLEDGED | Taps [Got it] | Student |
| IN_PROGRESS | "half done", or teacher marks a doubt resolved | Student (LLM interprets) or teacher |
| BLOCKED | [I'm stuck] or "stuck on q5"; submit reminders stop | Student (LLM interprets) |
| SUBMITTED | Photo, file, text, or "bringing it to class"; resubmission allowed (latest counts) | Student |
| NEEDS_REVISION | Feedback asks for a redo | Teacher |
| COMPLETED | Feedback accepts, or "checked in class" | Teacher |

- Assignment-level: DRAFT (unconfirmed preview) → PUBLISHED → CANCELLED.
- **Computed flags, not states:** OVERDUE (past due, not submitted/completed) · SILENT (no student activity N hours after delivery; N = 12 in pilot) · SEEN_CHANGE (ackedVersion == assignment.version).
- Leaving BLOCKED: student reports progress/submits, or teacher taps [Mark resolved] → IN_PROGRESS and the student is told "Your teacher marked your doubt as resolved. Still stuck? [I'm still stuck]".
- **Corrections:** changing deadline/instructions bumps `version`; statuses stay; each student must re-acknowledge; teacher sees "N haven't seen the change".
- Transitions are enforced in one state-machine module; illegal transitions are rejected, never silently applied.

## 5. Chat vs Mini App

**Chat is for moments, the Mini App is for overviews.** One message + one tap → chat. Scan, compare, history → app. Bot is 1:1 only (ignore group chats). Every bot message that refers to something has an **[Open]** web_app button to the exact screen.

| Role | Bot (chat) | Mini App |
| --- | --- | --- |
| Student | New assignments with [Got it] [I'm stuck] [Done] [Open]; reminders; informal replies; submit by photo, file or text; doubt replies; feedback | My work (due today, this week, overdue, done); assignment detail (latest version, what changed); submit (text, in class, photo/file upload); doubt thread; feedback history |
| Subject teacher | Create, change, cancel assignments by typing, with a preview to confirm; real-time doubt alerts; morning digest | Triage board; assignment status per student; doubt threads + replies; review + feedback; rosters, class links, unlinking; [Run reminders now]; "New assignment" form (no-LLM fallback) |
| Class teacher | — | Class load by due date across subjects; students struggling in 2+ subjects; everything in the class, read-only |
| Coordinator | Invite/setup messages only | School health per class; drill to subject → student names + statuses; teacher invites |

**Notification policy**

| Rule | Detail |
| --- | --- |
| Student quiet hours | No messages to students 21:00–07:00 IST, incl. teacher replies; queued until 07:00; teacher sees "Delivered at 7:00 am" |
| Teacher doubt alerts | Real time, at any hour; [Reply] opens the thread in the Mini App (replies are app-only) |
| Everything else for teachers | Submissions, acks, silent, overdue → 07:30 IST digest of counts; skipped if nothing to report |
| Blocked students | No "please submit" reminders while blocked |
| Corrections | Re-acknowledge required; teachers see who hasn't |

## 6. Flows per persona

### Student
1. **Join.** Class link → confirm class & school → pick unclaimed name → linked; pending assignments delivered.
2. **Receive.** Card: subject, title, due date/time IST, instructions, notes, [Got it] [I'm stuck] [Done] [Open].
3. **Respond.** Button or free text ("stuck on q5 formula"). Bot echoes what it understood ("Marked as stuck on Maths 4.2. Your teacher has been notified."). Unclear assignment → "Which one? [Maths 4.2] [Science lab]". Model unsure → "Did you mean [I'm stuck] [Making progress] [Something else]". A question like "which page was it" → bot shows the assignment's instructions (from the DB, not the LLM) + [Ask my teacher].
4. **Submit.** Photo/file/text → "Submit this for Maths 4.2? [Yes, submit] [No, it's a doubt]". [Done] → [Send it now] [Bringing it to class]. "did it but no space to send photo" → offer [Bringing it to class]. Resubmission allowed.
5. **Changes.** "Updated: Maths 4.2 now due Mon 23 Nov (was Thu 19). [Got it]" / "Cancelled: Science lab report."
6. **Doubt reply.** Arrives in chat (after 07:00 if sent at night) and in the app thread.
7. **Feedback.** "Completed" or "Needs revision" + comment; [Resubmit] on revision.

### Subject teacher
1. **Onboard.** Invite link → sees own classes/subjects → shares class link → roster fills.
2. **Create in chat.** "8A maths ex 4.2 q1 to q8 due day after, skip q8 if they did the extra sheet" → preview (class, subject, title, instructions, due in IST, conditional line kept as a note with [Pick students instead]) → [Send] [Edit] [Cancel]. Missing class (teaches 2 sections) → "Which class? [8A] [8B]". Missing date → asked. Missing time → "What time? [8:00 am] [5:00 pm] [Other]". Past date → rejected.
3. **Change/cancel in chat.** "move maths 4.2 to monday" → preview old → new → [Confirm] → students notified, asked to re-ack.
4. **Doubt alert (real time).** "Ravi (8A) is stuck on Maths 4.2: 'stuck on q5 formula' [Reply] [Open]".
5. **Morning digest 07:30.** "Maths today: 3 stuck · 5 haven't seen 4.2 · 12 to review · 2 overdue [Open triage]".
6. **Triage board.** All classes + filter: Stuck · Silent · Overdue · To review, most urgent first; [Reply] [Nudge] [Mark resolved] [Review].
7. **Review.** Submission preview → feedback → [Completed] / [Needs revision]; bulk [Checked in class].

### Class teacher
1. **My class:** all subjects' deadlines by date; 3+ due on one day flagged.
2. **Struggling in 2+ subjects:** list; open a student → all their work, read-only.

### Coordinator
1. **Setup:** classes, teacher invites with memberships, class teacher per class.
2. **School health:** per class: open assignments, % seen, % overdue, stuck count, linked/total; worst class flagged → drill to subject → student names + statuses.

## 7. User stories (acceptance criteria → tests)

### Student
| ID | Story | Acceptance criteria |
| --- | --- | --- |
| S1 | Join my class via class link | Confirms class & school · only unclaimed names · claimed → "ask your teacher" · wrong/expired code → clear message, nothing linked · pending assignments delivered after linking · unlinked users told how to join |
| S2 | Receive an assignment | Card with subject, title, due IST, instructions, notes, 4 buttons · nothing sent 21:00–07:00 · one message per student per assignment even on retry |
| S3 | Acknowledge | [Got it] → ACKNOWLEDGED · double tap changes nothing · after a change, records the new version |
| S4 | Say I'm stuck / making progress | Buttons or free text · bot echoes understanding · unclear assignment → "Which one?" · low confidence → choices · stuck → teacher alerted, submit reminders stop |
| S5 | Submit | Every attachment confirmed · [Done] → now or in class · resubmission allowed, history kept · Telegram retry never duplicates |
| S6 | Get help on a doubt | Teacher reply arrives in chat (after 07:00 if at night) and in app thread · [I'm still stuck] after "resolved" |
| S7 | Get feedback | In chat with result · [Resubmit] on revision · history in app |
| S8 | See all my work | Due today / this week / overdue / done · latest instructions + what changed · other students' data refused by server |

### Subject teacher
| ID | Story | Acceptance criteria |
| --- | --- | --- |
| T1 | Share class link, see who joined | Only my classes/subjects · link per class · roster linked/not · regenerate code · unlink a wrongly claimed name |
| T2 | Create by typing | Preview first, nothing sent before [Send] · relative dates in IST · morning/afternoon/evening → 08:00/14:00/18:00 · missing time/class → asked · past date rejected · conditional lines → note · double tap → one assignment · model failure → [Create in app] form · own class+subject only |
| T3 | Change or cancel | Typed or in app · unclear which → asked · preview old → new · confirm → notified + re-ack · cancel removes it from students' lists · can't touch another teacher's work |
| T4 | Handle doubts | Real-time alert any hour · [Reply] opens thread in app · night replies show "Delivered at 7:00 am" · [Mark resolved] → IN_PROGRESS |
| T5 | Morning digest | 07:30, counts across my classes · [Open triage] · skipped if nothing to report |
| T6 | Triage board | All classes + filter · Stuck, Silent, Overdue, To review · one-tap actions |
| T7 | Review + feedback | Preview photo/file/text/in-class · feedback + result · student told in chat · bulk [Checked in class] |
| T8 | Assignment status | Every student's status + overdue/silent/"hasn't seen change" flags · [Nudge] selected students (quiet hours apply) |
| T9 | Run reminders now (demo) | Same logic as the tick · rerun never double-sends |

### Class teacher
| ID | Story | Acceptance criteria |
| --- | --- | --- |
| CT1 | Class load across subjects | All subjects by due date · 3+ on one day flagged · read-only |
| CT2 | Students struggling everywhere | Stuck/silent/overdue in 2+ subjects · open student → all work, read-only |

### Coordinator
| ID | Story | Acceptance criteria |
| --- | --- | --- |
| C1 | Set up the school | Invite carries memberships · multi-role users · class teacher per class · invites one-use & expiring · own school only |
| C2 | Which classes are falling behind | Per class: open, % seen, % overdue, stuck, linked · worst flagged · drill to subject → names + statuses · no submissions/feedback |

### System
| ID | Story | Acceptance criteria |
| --- | --- | --- |
| SYS1 | No duplicates | Same Telegram update / double tap processed once; no duplicate assignments, submissions, acks |
| SYS2 | Survives restarts | Reminders/queue in DB; after restart, due jobs run once; nothing sent twice |
| SYS3 | Safe when the model fails | Timeout/invalid/low confidence → buttons or form; logged `model.failure` |
| SYS4 | Safe when Telegram is down | Queued messages retry with backoff; nothing lost |
| SYS5 | Observable | Logs: assignment.created, reminder.sent, submission.received, feedback.sent, model.failure (+ access.denied) |
| SYS6 | Wrong-context actions rejected | Other class's API, other student's data, forged initData → refused with clear message, logged |

## 8. Architecture

```
 Telegram app (students / teachers / coordinator)
   │ chat, taps                         │ opens Mini App (+ signed initData)
   ▼                                    ▼
┌──────────────────── Next.js app on Vercel ─────────────────────┐
│  /api/telegram (grammY webhook;        /app/* Mini App pages    │
│   dedupe by update_id; secret header)  /api/app/* (verifies     │
│                                          initData every request)│
│                 ▼                                ▼              │
│          ┌──────── ACCESS CHECK (lib/access) ────────┐          │
│          └───────────────────┬───────────────────────┘          │
│   Domain: assignments · state machine · submissions · feedback  │
│           · doubts · triage · digest · reminders                │
│        │                                   │                    │
│   LLM module (Claude Haiku 5.5,     /api/tick (every minute,    │
│   tool-use JSON + zod; fallback)     called by Supabase pg_cron)│
│                                      reminders · digest ·       │
│                                      outbound queue (ALL sends) │
└────────┬──────────────────────────────┬───────────────┬─────────┘
         ▼                              ▼               ▼
     Claude API                  Supabase Postgres   Telegram Bot API
```

- One Next.js app + one DB. No extra queue/cache.
- Jobs live in the DB (rows with due time, status, unique key) → restart-safe, no double sends.
- Supabase pg_cron calls `POST /api/tick` every minute with `Authorization: Bearer CRON_SECRET`; the same logic powers [Run reminders now]; also keeps the free Supabase project from pausing.
- ALL messages to users go through the OutboundMessage queue (quiet hours, retries with backoff). Exception allowed: immediate replies to the user's own action in the same webhook (echo/confirm/preview) may be sent directly, because they are answers, not notifications.
- Files stay in Telegram (store file_id). Mini App previews stream through `/api/files/[submissionId]` after the access check. Mini App uploads are re-sent by the bot to the student's own chat to obtain a file_id.

## 9. LLM boundary

The model interprets and phrases; code decides and acts. Every feature works when the model is down (buttons + app form).

| The model decides | Code decides |
| --- | --- |
| What a student's message means | Status changes (state machine only) |
| Which assignment it's about — chosen from candidate IDs we pass in | Who can do what (access) |
| Fields of a teacher's message: class hint, subject, title, instructions, notes/conditions, date (YYYY-MM-DD), time-of-day word, explicit time | Mapping time-of-day → time, IST, rejecting past dates, asking for missing time/class |
| Wording of reminders and digest | What is sent, to whom, when; quiet hours; every number |

**Containment:** forced tool-use JSON + zod validation (fail → model failure) · IDs must be in the candidate list · confidence threshold (default 0.7) → buttons below it · timeout (8 s) / errors → fallback + `model.failure` log · teacher confirms every assignment/change/cancel · digest numbers computed by code · reminder text checked (length ≤ 400, no URLs, no other student names) else template · student text passed as data inside delimiters, never as instructions.

**Evaluation:** `tests/evals/*.json` built from the pilot messages ("mam i did it but my phone has no space cant send photo", "stuck on question 5, not understanding the formula", "which page was it", "Change of plan, lab report is due Monday not Friday", "Do exercise 4.2 q1 to q8, bring it day after. Those who did the extra sheet last week can skip q8.") plus variations; `npm run eval` reports accuracy. Production signals: teacher preview-edit rate, "Something else" rate.

## 10. Reminder policy

State-aware; each type fires at most once per assignment (ReminderFired unique key); nothing to students 21:00–07:00 IST.

| Student is… | Message | When | Limit |
| --- | --- | --- | --- |
| Silent (no activity N h after delivery; N=12) | "Did you see Maths 4.2? Due Thu 8:00 am. [Got it] [I'm stuck]" | Next tick after N h, outside quiet hours | Once per assignment |
| Acknowledged / in progress, due within next day | "Maths 4.2 is due tomorrow at 8:00 am. [Done] [I'm stuck]" | 18:00 IST the evening before | Once |
| Blocked | No submit reminders. Check-in: "Still stuck on Maths 4.2? [Still stuck] [Figured it out]" | 07:00 next morning if still blocked | Once per doubt |
| Overdue | "Maths 4.2 was due yesterday. [Submit now] [Bringing it today] [I'm stuck]" | 07:00 the day after the deadline | Once; then teacher's triage |
| Submitted / completed | Nothing | — | — |

- **No daily cap, but merged:** reminders for the same student in the same tick → one message.
- **Wording:** Claude phrases from fields; validated; template fallback.
- **Demo mode:** timings are env settings (`SILENT_AFTER_MINUTES=720` pilot, `2` demo). [Run reminders now] = same code path as the tick.

## 11. Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router, TypeScript strict) on Vercel Hobby |
| Bot | grammY inside `/api/telegram` (webhook in prod; long-polling script for local dev) |
| DB | Supabase Postgres + Prisma (pooled `DATABASE_URL` port 6543 `?pgbouncer=true&connection_limit=1`; `DIRECT_URL` port 5432 for migrations) |
| Scheduler | Supabase pg_cron + pg_net → `/api/tick` every minute |
| LLM | Claude Haiku 5.5 (`claude-haiku-5-5`) via `@anthropic-ai/sdk`, forced tool use + zod |
| Time | Luxon, zone `Asia/Kolkata` everywhere |
| UI | React (Next.js) + Tailwind, Telegram theme CSS variables |
| Tests | Vitest |

Not used: Supabase Auth (Telegram identity), Supabase Storage (files stay in Telegram).
