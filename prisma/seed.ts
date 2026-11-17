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
  Mr. Arjun Das (tg ${arjun.telegramId}, fake): English 8B
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
