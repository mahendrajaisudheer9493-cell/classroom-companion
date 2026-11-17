# Demo video script (about 7 minutes)

Three phones on screen (screen-mirrored or filmed side by side) plus a laptop terminal:

| Screen | Account |
| --- | --- |
| **A** | Mrs. Lakshmi Rao: Maths teacher 8A/8B, class teacher 8A, coordinator |
| **B** | Ravi Kumar, 8A, already linked |
| **C** | Anu Reddy, 8A, joins live |
| **Laptop** | Terminal in the repo |

## Before recording (about 10 minutes)

1. **Reset the data.** On the laptop, run `npm run db:reset`. This drops everything and re-seeds Greenfield, Riverside, Ravi linked, Anu unlinked, Mr. Das's English and the 8A history used by the class teacher, coordinator and at-risk views (rolls 3–6 only, so Ravi's and Anu's phones stay clean).
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

| Time | Screen | Do | Say |
| --- | --- | --- | --- |
| 0:00–0:20 | Title, then A | Show the Today card on A (counts from the seeded Maths 4.1) | "In a Grade 8 class, homework goes into a busy group chat. A teacher can't tell who hasn't seen it, who's stuck and who just hasn't done it, because silence looks the same for all three. Classroom Companion gives every student a private one-tap *got it / stuck / done*, and turns that into a morning list of who needs attention." |
| 0:20–1:00 | A | **Step 1.** Type `Do exercise 4.2 q1 to q8, bring it day after. Those who did the extra sheet last week can skip q8.` Tap **8A**, then **8:00 am**. Point at the preview's date and **⚠ Note**. Tap **Send**. B buzzes | "I type homework the way teachers already do. The model only pulls out the fields. Code works out the date in IST, asks for the class and time I left out, and turns the 'skip q8' condition into a note. Nothing goes out until I press Send." |
| 1:00–1:10 | B | Show Ravi's card with [Got it] [I'm stuck] [Done] [Open] | "Ravi is already linked. He gets a private card with one-tap buttons." |
| 1:10–1:40 | C | **Step 2.** Open `t.me/greenfield_classroom_bot?start=c_GF8A` → "You're joining 8A, Greenfield Public School. Correct?" → **Yes** → only unclaimed names show → tap **Anu Reddy**. The Ex 4.2 card arrives | "Anu isn't on Telegram yet. One class link, confirm the class, pick your name. Ravi isn't in the list because he's already claimed. Identity comes from the roster, not the Telegram name, because family phones are shared. The card she missed is delivered as soon as she links." |
| 1:40–2:15 | B → A → B | **Step 3.** B types `stuck on question 5, not understanding the formula`. A gets the alert → **Reply** → Mini App thread → type `Use a² + b² = c², q5 is a right triangle` → **Send reply**. B receives it | "Ravi says it in his own words. The model classifies it as 'stuck', and the state machine, not the model, marks him BLOCKED. I'm alerted at once, even at night. My reply would wait until 7 am for a student, but right now it's delivered immediately." |
| 2:15–2:55 | A, then B and C | **Step 4.** (At least 2 min since Anu's card arrived; trim the wait in editing.) A: home → **Run reminders now** → read the result line out loud. C gets "did you see it?" with [Got it] [I'm stuck]. B gets only "Still stuck on …?" with [Still stuck] [Figured it out]. Tap **Run reminders now** again → "No reminders due right now" | "Same code as the minute-by-minute scheduler. Anu has been silent, so she's asked whether she saw it. Ravi is stuck, so he never gets nagged to submit. He only gets asked whether he's still stuck. Each reminder fires once: running it again sends nothing." |
| 2:55–3:40 | A, C, A | **Step 5.** A types `move maths 4.2 to monday morning` → preview old → new → **Confirm**. B and C get "Updated". C taps **Got it**, sends a photo → **Yes, submit**. A: triage → **To review** → **Review** → photo inline → `show your working` → **Needs revision**. C gets it with [Resubmit] | "Changes are previewed too, and every student must acknowledge again. Anu submits a photo. The file stays in Telegram, and I preview it through an access-checked endpoint. 'Needs revision' requires a comment, and she gets a Resubmit button." |
| 3:40–4:10 | A | **Triage board.** Open it from the Today card. Top: **⚠ At risk this week** (Sneha: overdue + silent on Maths 4.1). Then Stuck (Ravi, with [Reply] [Mark resolved]), Silent (tagged "not on Telegram yet" / "hasn't seen the change"), Overdue, To review. Tap the class chips. Open an assignment: statuses, last reminder per student, select → **Checked in class** | "This is the part teachers asked for: 'talk to these four today'. At the top, who is at risk this week: two or more warning signs, counted by code. Then stuck, silent, overdue and to review, each with a one-tap action. The 7:30 digest sends me the same numbers every morning." |
| 4:10–4:25 | Laptop | **Step 6.** Run `npm run demo:unauthorized` | "Access is enforced on the server. My own roster: 200. Ravi asking for the class roster: 403. Me asking for another school's class: 403. Ravi's signed sign-in edited to claim my id: 401, because the signature no longer matches. Every refusal is logged." |
| 4:25–4:55 | A | **Class teacher.** Home → My classes → **8A** → tab **Load**: the day after tomorrow shows "3 due · ⚠ Heavy day" (English, Science, Science). Tab **Struggling**: Sneha "silent in English, Maths and Science, overdue in English and Maths", Kiran "overdue in English and Maths" → tap Sneha → all her work across subjects, read-only | "I'm also class teacher of 8A. Load shows every subject's deadlines, so I can see a heavy day coming. Struggling shows who is in trouble in two or more subjects, which no single subject teacher can see. It's read-only: I can see English and Science, but I can't act on them." |
| 4:55–5:30 | A | **Coordinator.** Home → **School health** card ("⚠ 8A is falling behind") → table per class → tap **8A** → per subject → tap **English** → names and status chips only. Back → **School setup** → Invite a teacher: 8B · Subject teacher · `Science` → **Create invite** → link with [Copy] [Share] | "As coordinator I see the school: per class, open work, percent seen, percent overdue, stuck, linked. The worst class is flagged. I can drill down to names and statuses, but never submissions or doubts. The server never sends them. Setup is here too: a class from a pasted roster, one-use teacher invites, and the class teacher for each class, all limited to my school." |
| 5:30–5:50 | C | **LLM boundary.** C types `hmm idk` → "I'm not sure what you mean." with [I'm stuck] [Making progress] [Done] [Open my work] | "When the model isn't sure, below 0.7 confidence, it never guesses. The student gets buttons. Code makes every status change and computes every number. Timeouts and bad output fall back the same way and are logged as model.failure." |
| 5:50–7:00 | Face or slides | **How I built it with AI, and where I overrode it** (about 70 s; write your own words, notes below) | — |

### Notes for the last section (60–90 s; replace with your own)

- **How I split the work:** one design doc and PRD first, then one task at a time (scaffold, bot and access, assignments, student replies, teacher screens, reminders), each ending with typecheck, tests and a commit.
- **Examples of overriding the AI:**
  - pinned Prisma 6 when the newest version broke the Supabase setup
  - redefined confidence after the first student eval
  - left "next Friday" as a known ambiguous case instead of tuning the prompt to pass it
  - caught a commit that went in with a failing test
  - made "Run reminders now" name only my own students
  - limited the integration tests to a throwaway school so the job couldn't message real phones
- **What I checked myself:** every LLM output goes through zod, candidate ids and a confidence check, and the access demo runs against the deployed app.
