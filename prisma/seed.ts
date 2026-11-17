// Demo seed. Idempotent: safe to run twice (upserts / find-or-create on stable keys).
// Run: npm run db:seed   (also runs automatically after npm run db:reset)
import { config } from "dotenv";
config({ quiet: true });

import { Prisma, PrismaClient, Role } from "@prisma/client";
import { DateTime } from "luxon";
import { z } from "zod";
import { telegramId } from "../lib/env";

const prisma = new PrismaClient();
const IST = "Asia/Kolkata";

// Only the seed variables are needed here, so the seed works before Telegram/LLM keys are filled in.
const seedEnv = z
  .object({
    SEED_TEACHER_TELEGRAM_ID: telegramId,
    SEED_STUDENT_TELEGRAM_ID: telegramId,
    SEED_COORDINATOR_TELEGRAM_ID: telegramId.optional(),
  })
  .parse(
    Object.fromEntries(
      Object.entries(process.env).filter(([k, v]) => k.startsWith("SEED_") && v?.trim()),
    ),
  );

const ARJUN_TELEGRAM_ID = 1000000001n; // fake account: Mr. Das never opens the bot in the demo
const PRIYA_TELEGRAM_ID = 1000000002n; // fake account: Science teacher of 8A
const SNEHA_TELEGRAM_ID = 1000000003n; // fake account: Sneha is "linked" but never started the bot

async function findOrCreateSchool(name: string) {
  const existing = await prisma.school.findFirst({ where: { name } });
  return existing ?? prisma.school.create({ data: { name, timezone: IST } });
}

async function upsertClass(schoolId: string, name: string, grade: number) {
  return prisma.class.upsert({
    where: { schoolId_name: { schoolId, name } },
    update: { grade },
    create: { schoolId, name, grade },
  });
}

async function upsertJoinCode(classId: string, code: string, expiresAt: Date) {
  return prisma.joinCode.upsert({
    where: { code },
    update: { classId, expiresAt, revokedAt: null },
    create: { classId, code, expiresAt },
  });
}

async function upsertUser(telegramIdValue: bigint, displayName: string) {
  return prisma.user.upsert({
    where: { telegramId: telegramIdValue },
    update: { displayName },
    // chatId stays null until the person sends /start (Telegram only allows bots to message users who did).
    create: { telegramId: telegramIdValue, displayName },
  });
}

// The Membership unique key contains nullable columns (Postgres treats NULLs as distinct),
// so Prisma upsert can't target it. Find-or-create instead.
async function ensureMembership(data: {
  userId: string;
  schoolId: string;
  classId?: string;
  role: Role;
  subject?: string;
}) {
  const where = { ...data, classId: data.classId ?? null, subject: data.subject ?? null };
  const existing = await prisma.membership.findFirst({ where });
  return existing ?? prisma.membership.create({ data: where });
}

async function upsertStudent(
  schoolId: string,
  classId: string,
  rollNo: number,
  name: string,
  linkToUserId?: string,
) {
  const link = linkToUserId ? { userId: linkToUserId, linkedAt: new Date() } : {};
  return prisma.student.upsert({
    where: { classId_rollNo: { classId, rollNo: String(rollNo) } },
    // Re-seeding doesn't unlink students who linked live; db:reset gives a clean slate.
    update: { name, ...link },
    create: { schoolId, classId, rollNo: String(rollNo), name, ...link },
  });
}

async function main() {
  const now = DateTime.now().setZone(IST);
  const in60Days = now.plus({ days: 60 }).toJSDate();

  // ── Greenfield ──────────────────────────────────────────────────────────────
  const greenfield = await findOrCreateSchool("Greenfield Public School");
  const c8A = await upsertClass(greenfield.id, "8A", 8);
  const c8B = await upsertClass(greenfield.id, "8B", 8);

  await upsertJoinCode(c8A.id, "GF8A", in60Days);
  await upsertJoinCode(c8B.id, "GF8B", in60Days);
  await upsertJoinCode(c8A.id, "GF8A-OLD", now.minus({ days: 1 }).toJSDate()); // expired on purpose

  // Teachers and coordinator
  const lakshmi = await upsertUser(seedEnv.SEED_TEACHER_TELEGRAM_ID, "Mrs. Lakshmi Rao");
  await ensureMembership({ userId: lakshmi.id, schoolId: greenfield.id, classId: c8A.id, role: Role.SUBJECT_TEACHER, subject: "Maths" });
  await ensureMembership({ userId: lakshmi.id, schoolId: greenfield.id, classId: c8B.id, role: Role.SUBJECT_TEACHER, subject: "Maths" });
  await ensureMembership({ userId: lakshmi.id, schoolId: greenfield.id, classId: c8A.id, role: Role.CLASS_TEACHER });

  const coordId = seedEnv.SEED_COORDINATOR_TELEGRAM_ID;
  const coordinator =
    coordId && coordId !== seedEnv.SEED_TEACHER_TELEGRAM_ID
      ? await upsertUser(coordId, "Meera")
      : lakshmi; // one person, several roles
  await ensureMembership({ userId: coordinator.id, schoolId: greenfield.id, role: Role.COORDINATOR });

  const arjun = await upsertUser(ARJUN_TELEGRAM_ID, "Mr. Arjun Das");
  await ensureMembership({ userId: arjun.id, schoolId: greenfield.id, classId: c8B.id, role: Role.SUBJECT_TEACHER, subject: "English" });

  // A one-use teacher invite, to try the t_<CODE> flow (re-seeding doesn't reset a used invite).
  const invite = await prisma.teacherInvite.upsert({
    where: { code: "GFSCI8A" },
    update: {},
    create: {
      schoolId: greenfield.id,
      code: "GFSCI8A",
      grants: [{ classId: c8A.id, role: Role.SUBJECT_TEACHER, subject: "Science" }],
      expiresAt: now.plus({ days: 30 }).toJSDate(),
    },
  });

  // Students
  const raviUser = await upsertUser(seedEnv.SEED_STUDENT_TELEGRAM_ID, "Ravi Kumar");
  const students8A = [
    await upsertStudent(greenfield.id, c8A.id, 1, "Ravi Kumar", raviUser.id),
    await upsertStudent(greenfield.id, c8A.id, 2, "Anu Reddy"),
    await upsertStudent(greenfield.id, c8A.id, 3, "Kiran Patel"),
    await upsertStudent(greenfield.id, c8A.id, 4, "Sneha Iyer"),
    await upsertStudent(greenfield.id, c8A.id, 5, "Farhan Ali"),
    await upsertStudent(greenfield.id, c8A.id, 6, "Divya Nair"),
  ];
  const students8B = [
    await upsertStudent(greenfield.id, c8B.id, 1, "Rahul Verma"),
    await upsertStudent(greenfield.id, c8B.id, 2, "Pooja Shah"),
    await upsertStudent(greenfield.id, c8B.id, 3, "Arun Menon"),
  ];

  // English assignment in 8B by Mr. Das (the Maths teacher must NOT see it). No Maths assignment:
  // the demo creates it live.
  const englishTitle = "Essay: My favourite festival";
  const dueAt = now.plus({ days: 3 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  const englishData = {
    instructions: "Write 250-300 words about your favourite festival and how your family celebrates it.",
    notes: "Use at least three paragraphs.",
    dueAt,
  };
  const existingEnglish = await prisma.assignment.findFirst({
    where: { classId: c8B.id, subject: "English", title: englishTitle },
  });
  const english = existingEnglish
    ? await prisma.assignment.update({ where: { id: existingEnglish.id }, data: englishData })
    : await prisma.assignment.create({
        data: {
          ...englishData,
          schoolId: greenfield.id,
          classId: c8B.id,
          subject: "English",
          title: englishTitle,
          createdByUserId: arjun.id,
          status: "PUBLISHED",
          publishedAt: now.toJSDate(),
        },
      });
  if (!existingEnglish) {
    await prisma.activityEvent.create({
      data: {
        type: "assignment.created",
        schoolId: greenfield.id,
        classId: c8B.id,
        assignmentId: english.id,
        actorUserId: arjun.id,
        data: { source: "seed" } satisfies Prisma.InputJsonValue,
      },
    });
  }
  for (const s of students8B) {
    await prisma.studentAssignment.upsert({
      where: { assignmentId_studentId: { assignmentId: english.id, studentId: s.id } },
      update: {},
      create: { assignmentId: english.id, studentId: s.id }, // ASSIGNED; not delivered (unlinked)
    });
  }

  // ── 8A history across subjects (class teacher Load/Struggling, school health, at-risk) ──────────
  // Targets roll 3-6 only (selected students): Ravi and Anu are the live demo phones, so their chats
  // and reminders stay exactly as in the live scenario. Sneha is linked to a fake account that never
  // started the bot, so nothing is ever sent to her.
  await ensureMembership({ userId: arjun.id, schoolId: greenfield.id, classId: c8A.id, role: Role.SUBJECT_TEACHER, subject: "English" });
  const priya = await upsertUser(PRIYA_TELEGRAM_ID, "Mrs. Priya Nair");
  await ensureMembership({ userId: priya.id, schoolId: greenfield.id, classId: c8A.id, role: Role.SUBJECT_TEACHER, subject: "Science" });
  const snehaUser = await upsertUser(SNEHA_TELEGRAM_ID, "Sneha (demo account)");
  const [, , kiran, sneha, farhan, divya] = students8A;
  await prisma.student.update({ where: { id: sneha.id }, data: { userId: snehaUser.id, linkedAt: sneha.linkedAt ?? now.toJSDate() } });

  const at = (days: number, hour: number) => now.plus({ days }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  const delivered = (days: number) => now.minus({ days }).toJSDate();
  type SaSeed = { student: { id: string }; status?: "ASSIGNED" | "ACKNOWLEDGED" | "SUBMITTED" | "COMPLETED"; deliveredDaysAgo?: number };
  async function ensureAssignment(a: { classId: string; subject: string; title: string; teacherId: string; dueAt: Date; instructions: string }, sas: SaSeed[]) {
    const found = await prisma.assignment.findFirst({ where: { classId: a.classId, subject: a.subject, title: a.title } });
    const assignment =
      found ??
      (await prisma.assignment.create({
        data: {
          schoolId: greenfield.id, classId: a.classId, subject: a.subject, title: a.title, instructions: a.instructions,
          dueAt: a.dueAt, createdByUserId: a.teacherId, status: "PUBLISHED", publishedAt: delivered(5),
        },
      }));
    for (const s of sas) {
      const status = s.status ?? "ASSIGNED";
      await prisma.studentAssignment.upsert({
        where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: s.student.id } },
        update: {},
        create: {
          assignmentId: assignment.id,
          studentId: s.student.id,
          status,
          ackedVersion: status === "ASSIGNED" ? null : 1,
          deliveredAt: s.deliveredDaysAgo === undefined ? null : delivered(s.deliveredDaysAgo),
        },
      });
      if (status === "SUBMITTED" || status === "COMPLETED") {
        const sa = await prisma.studentAssignment.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: s.student.id } } });
        if ((await prisma.submission.count({ where: { studentAssignmentId: sa.id } })) === 0) {
          await prisma.submission.create({ data: { studentAssignmentId: sa.id, kind: "IN_CLASS" } });
        }
      }
    }
    return assignment;
  }

  // Maths (Lakshmi): an older exercise, now overdue → triage board, digest and "at risk" have something to show.
  await ensureAssignment(
    { classId: c8A.id, subject: "Maths", title: "Exercise 4.1", teacherId: lakshmi.id, dueAt: at(-2, 8), instructions: "Exercise 4.1, q1 to q10." },
    [{ student: kiran }, { student: sneha, deliveredDaysAgo: 4 }, { student: farhan, status: "SUBMITTED" }, { student: divya, status: "COMPLETED" }],
  );
  // English (Mr. Das): overdue worksheet + an essay due in 2 days.
  await ensureAssignment(
    { classId: c8A.id, subject: "English", title: "Grammar worksheet 3", teacherId: arjun.id, dueAt: at(-1, 8), instructions: "Worksheet 3, all questions." },
    [{ student: kiran }, { student: sneha, deliveredDaysAgo: 4 }, { student: farhan, status: "SUBMITTED" }, { student: divya, status: "SUBMITTED" }],
  );
  await ensureAssignment(
    { classId: c8A.id, subject: "English", title: "Essay: a letter to a friend", teacherId: arjun.id, dueAt: at(2, 15), instructions: "200 words." },
    [{ student: kiran }, { student: sneha, deliveredDaysAgo: 1 }, { student: farhan, status: "ACKNOWLEDGED" }, { student: divya, status: "ACKNOWLEDGED" }],
  );
  // Science (Mrs. Nair): lab report + reading due in 2 days → with the English essay that day has 3 → ⚠ Heavy day
  // (4 once the live Maths 4.2, "day after", is sent).
  await ensureAssignment(
    { classId: c8A.id, subject: "Science", title: "Lab report: plant cells", teacherId: priya.id, dueAt: at(2, 17), instructions: "Draw and label a plant cell; write the aim and result." },
    [{ student: kiran }, { student: sneha, deliveredDaysAgo: 1 }, { student: farhan, status: "ACKNOWLEDGED" }, { student: divya }],
  );

  await ensureAssignment(
    { classId: c8A.id, subject: "Science", title: "Read chapter 6", teacherId: priya.id, dueAt: at(2, 12), instructions: "Read chapter 6 and answer q1-q3." },
    [{ student: kiran }, { student: sneha, deliveredDaysAgo: 1 }, { student: farhan, status: "ACKNOWLEDGED" }, { student: divya, status: "ACKNOWLEDGED" }],
  );

  // ── Riverside (cross-school isolation) ─────────────────────────────────────
  const riverside = await findOrCreateSchool("Riverside School");
  const c7A = await upsertClass(riverside.id, "7A", 7);
  const studentsRiverside = [
    await upsertStudent(riverside.id, c7A.id, 1, "Asha Gupta"),
    await upsertStudent(riverside.id, c7A.id, 2, "Vikram Singh"),
  ];

  // ── Summary ────────────────────────────────────────────────────────────────
  const fmt = (d: Date) => DateTime.fromJSDate(d).setZone(IST).toFormat("ccc d LLL yyyy, h:mm a 'IST'");
  const names = (list: { name: string; userId: string | null }[]) =>
    list.map((s) => `${s.name}${s.userId ? " (linked)" : ""}`).join(", ");
  const coordLabel = coordinator.id === lakshmi.id ? "Mrs. Lakshmi Rao (same account as teacher)" : `Meera (tg ${coordinator.telegramId})`;

  console.log(`
Seed complete ✓
Greenfield Public School (Asia/Kolkata)
  Classes: 8A, 8B (grade 8)
  Join codes: GF8A, GF8B (expire ${fmt(in60Days)}); GF8A-OLD (expired, for testing)
  Mrs. Lakshmi Rao (tg ${lakshmi.telegramId}): Maths 8A, Maths 8B, class teacher 8A
  Coordinator: ${coordLabel}
  Mr. Arjun Das (tg ${arjun.telegramId}, fake): English 8A, English 8B
  Mrs. Priya Nair (tg ${priya.telegramId}, fake): Science 8A
  8A history (rolls 3-6 only): Maths 4.1 (overdue), English worksheet 3 (overdue), English essay + Science lab + Science reading (due in 2 days: heavy day)
  Teacher invite: ${invite.code} → Science teacher 8A (${invite.usedAt ? "already used" : `unused, expires ${fmt(invite.expiresAt)}`})
  8A students: ${names(students8A)}
  8B students: ${names(students8B)}
  Assignment: [English 8B] "${english.title}", PUBLISHED, due ${fmt(english.dueAt)}, ${students8B.length} students
Riverside School
  7A students: ${names(studentsRiverside)}
Ravi Kumar is linked to tg ${raviUser.telegramId}.
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
