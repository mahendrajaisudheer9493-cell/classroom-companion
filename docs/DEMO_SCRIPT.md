# Demo video script (about 7 minutes)

Three phones on screen (screen-mirrored or filmed side by side) plus a laptop terminal:

| Screen | Account |
| --- | --- |
| **A** | Mrs. Lakshmi Rao: Maths teacher 8A/8B, class teacher 8A, coordinator |
| **B** | Ravi Kumar, 8A, already linked |
| **C** | Anu Reddy, 8A, joins live |
| **Laptop** | Terminal in the repo |

## Before recording (about 10 minutes)

1. **Reset the data.** On the laptop, run `npm run db:reset` (on the recording day: the heavy day and overdue items are relative to the seed time). This drops everything and re-seeds Greenfield, Riverside, Ravi linked, Anu unlinked, Mr. Das's English and the 8A history used by the class teacher, coordinator and at-risk views (rolls 3–6 only, so Ravi's and Anu's phones stay clean).
2. **Demo timings in Vercel.** Settings → Environment Variables (Production):
   - `SILENT_AFTER_MINUTES=2`
   - `BLOCKED_CHECKIN_AFTER_MINUTES=2`
   - `DEMO_MODE=true`
   - `QUIET_HOURS_ENABLED=false`, only if recording between 21:00 and 07:00 IST.

   Then **Deployments → latest → Redeploy**, and wait for "Ready".
3. **Check the deploy.** Open `https://classroom-companion-delta.vercel.app/api/health` → `"ok":true`. Run `npm run webhook:set` only if `APP_URL` changed.
4. **Pause the cron** so reminders fire when *you* tap the button, not on their own. Supabase → SQL Editor:
   ```sql
   select cron.alter_job((select jobid from cron.job where jobname = 'classroom-tick'), active := false);
   ```
   Every step in the scenario sends its own messages straight away, so nothing else needs the cron.
5. **Start every phone.** On A, B and C, send `/start` to @greenfield_classroom_bot (the reset cleared their chat ids). Clear old chat history so the screens are clean.
6. **Prepare the laptop.** Open the terminal at the repo, with `npm run demo:unauthorized` typed but not yet run.
7. **After recording:** resume the cron (same SQL with `active := true`) and set the pilot values back (`720` / delete `BLOCKED_CHECKIN_AFTER_MINUTES` / `false` / `true`), then redeploy.

## Script

Steps 1–6 follow the brief in order (same messages as the README's live scenario). Teacher messages show the teacher's Telegram name.

| Time | Screen | Do | Say |
| --- | --- | --- | --- |
| 0:00–0:20 | Title, then A | Show the Today card on A | "In a Grade 8 class, homework goes into a busy group chat. A teacher can't tell who hasn't seen it, who's stuck and who just hasn't done it, because silence looks the same for all three. Classroom Companion gives every student a private one-tap *got it / stuck / done*, and turns that into a list of who needs attention." |
| 0:20–0:35 | A | **Step 1.** Menu button **Open** → My classes → **8A**: Ravi Kumar "Linked", Anu Reddy "Not linked yet", class link | "Greenfield Public School, class 8A. I'm the Maths teacher. Ravi is already linked; Anu isn't on Telegram yet. Identity comes from this roster, never from the Telegram name, because family phones are shared." |
| 0:35–1:05 | A, then B | **Step 2: assign.** Type `Do exercise 4.2 q1 to q8, bring it day after. Those who did the extra sheet last week can skip q8.` → **8A** → **8:00 am**. Point at the date and **⚠ Note** → **Send** → "Sent to 6 students in 8A (1 on Telegram now; 5 will get it when they join)." B buzzes: card with [Got it] [I'm stuck] [Done] [Open] | "I type it the way I'd say it. The model only extracts fields. Code turns 'day after' into a date in IST, asks for what I left out, and keeps 'skip q8' as a note. Nothing goes out until I press Send." |
| 1:05–1:30 | C | **Anu joins.** Open `t.me/greenfield_classroom_bot?start=c_GF8A` → "You're joining 8A, Greenfield Public School. Correct?" → **Yes** → tap **Anu Reddy** (Ravi isn't listed) → "You're linked as Anu Reddy, 8A." → the pending Ex 4.2 card arrives | "Anu taps the class link, confirms the class and picks her name. Claimed names aren't offered. The card she missed arrives straight away." |
| 1:30–1:55 | A, then B and C | **Step 2: change.** Type `move maths 4.2 to monday morning` → preview "Change … / Due: … → Mon …, 8:00 am" → **Confirm**. B and C get "Updated: … now due Mon … (was …)". **B** taps **Got it**. **C does nothing from now on** | "Changes are previewed too. Everyone is told and must acknowledge again. Ravi does; Anu stays silent." |
| 1:55–2:25 | B, then A | **Step 3.** B types `half done` → "Noted: you're working on … ✓". Then `stuck on question 5, not understanding the formula` → "Marked as stuck … Your teacher has been notified." A: "🆘 Ravi Kumar (8A) is stuck on …" with [Reply] | "Ravi writes like a 13-year-old. The model reads 'half done' as progress and the second message as stuck, and the state machine makes the change. I'm alerted in real time." |
| 2:25–3:00 | A, then C and B | **Step 4.** (Wait 2 minutes after Ravi's stuck message, so both timers have passed; cut the wait.) A: Home → **Run reminders now** → read the result aloud: "Sent: 1 'did you see it?' to Anu Reddy · 1 'still stuck?' to Ravi Kumar · Ravi Kumar is stuck, so no submit reminders". C: friendly "did you see it?" with [Got it] [I'm stuck]. B: only "Still stuck on …?" with [Still stuck] [Figured it out]. Tap **Run reminders now** again → "No reminders due right now." | "Same code as the every-minute scheduler. Silent Anu is asked whether she saw it. Stuck Ravi is never nagged to submit, only asked whether he's still stuck. Each reminder fires once, and nothing goes to students between 9 pm and 7 am." |
| 3:00–3:45 | C, A, C | **Step 5.** C sends a **photo** → "Submit this for …?" → **Yes, submit** → "Submitted ✓ …". A: Triage → 📥 To review → **Review** → photo inline → `All correct, well done` → **✓ Completed**. C gets "… ✓ Completed". A: tap the assignment name → Anu **Completed**, Ravi **Stuck** with last reminder "still stuck?". C: **Open** → My work → Ex 4.2 under **Done** | "Anu hands in a photo. It stays in Telegram, and I see it through an access-checked endpoint. I mark it completed, she's told in chat, and the Mini App shows the final state for every student." |
| 3:45–4:10 | Laptop, then B | **Step 6.** Run `npm run demo:unauthorized` → 200 / 403 / 403 / 401. Then B opens `t.me/greenfield_classroom_bot?start=c_GF8A-OLD` → "This class link has expired. Ask your teacher for a new one." | "Access is enforced on the server: Ravi asking for the class roster gets 403, I can't see another school's class, and a forged sign-in gets 401. Every refusal is logged. In the app, an expired class link changes nothing." |
| 4:10–4:35 | A | **Triage board** (standout). Today card → top **⚠ At risk this week** (Sneha: overdue + silent on Maths 4.1); 🆘 Stuck Ravi with [Reply] [Mark resolved]; 👀 Silent with tags; ⏰ Overdue; 📥 To review. Tap the class chips | "This is the screen teachers asked for: who to talk to today. Stuck, silent, overdue and to review, across all my classes, each with a one-tap action. The 7:30 digest sends me the same numbers every morning." |
| 4:35–4:50 | A | **Ask in chat.** Type `who is at risk this week?` → up to 6 lines (Sneha, Kiran) with [Open triage] | "I can also just ask. Code finds the facts. The model only words them, and if it adds a name or a number that isn't in the facts, a plain list is sent instead." |
| 4:50–5:15 | A | **Class teacher.** My classes → 8A → **Load**: "3 due · ⚠ Heavy day" → **Struggling**: Sneha, Kiran → tap Sneha → her work in every subject, read-only | "As class teacher I see every subject's deadlines, so I can spot a heavy day, and who is struggling in two or more subjects. Read-only: I can see, not act." |
| 5:15–5:40 | A | **Coordinator.** Home → **School health** ("⚠ 8A is falling behind") → 8A → English → names and status chips only → back → **School setup** → Invite: 8B · Subject teacher · `Science` → **Create invite** → link with [Copy] [Share] | "As coordinator: per class, open work, percent seen, percent overdue, stuck and linked, with the worst class flagged. I can drill down to names and statuses, never submissions. Setup covers classes from a pasted roster, invites and class teachers, limited to my school." |
| 5:40–5:55 | B | **LLM boundary.** B types `hmm idk` → "I'm not sure what you mean." with [I'm stuck] [Making progress] [Done] [Open my work] | "When the model isn't sure, it never guesses: the student gets buttons. Timeouts and bad output fall back the same way and are logged." |
| 5:55–7:00 | Face or slides | **How I built it with AI, and where I overrode it**: the five points below (about 65 s) | See below |

### The last section: how I built it with AI (about 65 s)

Five points, from the README's "How this was built with AI". Say them in your own words.

1. **Plan first, then small tasks** (≈15 s). "I used Claude in chat as a product thinking partner: the problem, the PRD and the design, with every decision written down, plus a CLAUDE.md of rules the code must never break: access on the server, no duplicate sends, never trust the model's output. Then Claude Code built it in 8 tasks, each ending in tests, a commit and a test on three real phones."
2. **I reframed the problem** (≈10 s). "The first PRD only served teachers. I pushed back: students and the coordinator are users too, with one shared root cause, that silence carries no information."
3. **I made the product calls** (≈15 s). "Assignments are created in chat with a preview, and feedback is given in the app, where the work is in front of you. Doubts reach me in real time, and everything else waits for a morning digest. Stuck students never get 'please submit' nudges."
4. **I corrected the AI on the model's evaluation** (≈15 s). "Student messages first scored 10 out of 18, because the model lowered its confidence whenever the homework wasn't named. I redefined confidence as being about the intent only, since code already asks 'which homework?'. And I left 'next Friday' as a known ambiguous case instead of overfitting, because the teacher confirms the exact date."
5. **My own phone testing found what the tests missed** (≈10 s). "The roster form submitted on Enter before the names were pasted, and the bot asked 'which homework?' when only one was still open. Both were found on the phones and fixed with tests."
