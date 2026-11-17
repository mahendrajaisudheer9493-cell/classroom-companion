import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The reminder engine against the dev database, scoped to a throwaway school (real students are
// never touched). Nothing is sent: runReminders only records ReminderFired and queues messages.

const { prisma } = await import("@/lib/db");
const { runReminders } = await import("@/lib/domain/reminders");
type Settings = import("@/lib/domain/reminders").ReminderSettings;

const run = Date.now();
const base = 6_000_000_000n + BigInt(run % 1_000_000_000);
const DEMO: Settings = { silentAfterMinutes: 2, dueSoonHour: 18, blockedCheckinAfterMinutes: 2, demoMode: true, quietHours: null };
type Ids = { school: string; users: string[]; ravi: string; anu: string; ravSa: string; anuSas: string[] };
let ids: Ids;

describe.skipIf(!process.env.DATABASE_URL)("reminder engine (integration)", () => {
  beforeAll(async () => {
    const school = await prisma.school.create({ data: { name: `ZZ Test R ${run}` } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "9R", grade: 9 } });
    const mkUser = (tg: bigint, name: string) => prisma.user.create({ data: { telegramId: tg, chatId: tg, displayName: name } });
    const teacher = await mkUser(base, "Mrs. Rao");
    const raviUser = await mkUser(base + 1n, "Ravi");
    const anuUser = await mkUser(base + 2n, "Anu");
    const ravi = await prisma.student.create({ data: { schoolId: school.id, classId: klass.id, name: "Ravi", rollNo: "1", userId: raviUser.id } });
    const anu = await prisma.student.create({ data: { schoolId: school.id, classId: klass.id, name: "Anu", rollNo: "2", userId: anuUser.id } });
    const mkAssignment = (title: string) =>
      prisma.assignment.create({
        data: {
          schoolId: school.id, classId: klass.id, subject: "Maths", createdByUserId: teacher.id, title, instructions: title,
          dueAt: new Date(Date.now() + 2 * 86_400_000), status: "PUBLISHED", publishedAt: new Date(),
        },
      });
    const a1 = await mkAssignment("Exercise 4.2");
    const a2 = await mkAssignment("Exercise 4.3");
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    // Ravi is stuck on 4.2: only the check-in. Anu is silent on both: one merged message.
    const ravSa = await prisma.studentAssignment.create({
      data: { assignmentId: a1.id, studentId: ravi.id, status: "BLOCKED", deliveredAt: tenMinAgo, blockedAt: tenMinAgo },
    });
    const anuSa1 = await prisma.studentAssignment.create({ data: { assignmentId: a1.id, studentId: anu.id, status: "ASSIGNED", deliveredAt: tenMinAgo } });
    const anuSa2 = await prisma.studentAssignment.create({ data: { assignmentId: a2.id, studentId: anu.id, status: "ASSIGNED", deliveredAt: tenMinAgo } });
    ids = { school: school.id, users: [teacher.id, raviUser.id, anuUser.id], ravi: raviUser.id, anu: anuUser.id, ravSa: ravSa.id, anuSas: [anuSa1.id, anuSa2.id] };
  });

  afterAll(async () => {
    if (!ids) return;
    const saIds = [ids.ravSa, ...ids.anuSas];
    await prisma.outboundMessage.deleteMany({ where: { recipientUserId: { in: ids.users } } });
    await prisma.reminderFired.deleteMany({ where: { studentAssignmentId: { in: saIds } } });
    await prisma.activityEvent.deleteMany({ where: { schoolId: ids.school } });
    await prisma.studentAssignment.deleteMany({ where: { id: { in: saIds } } });
    await prisma.assignment.deleteMany({ where: { schoolId: ids.school } });
    await prisma.student.deleteMany({ where: { schoolId: ids.school } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.class.deleteMany({ where: { schoolId: ids.school } });
    await prisma.school.delete({ where: { id: ids.school } });
  });

  it("blocked → check-in only; silent twice → one merged message; a second run fires nothing", async () => {
    const first = await runReminders(new Date(), { schoolId: ids.school, settings: DEMO });
    expect(first.counts).toEqual({ silent: 2, due_soon: 0, blocked_checkin: 1, overdue: 0, skippedBlocked: 1 });

    const anuMsgs = await prisma.outboundMessage.findMany({ where: { recipientUserId: ids.anu, kind: "reminder" } });
    expect(anuMsgs).toHaveLength(1);
    expect((anuMsgs[0].payload as { text: string }).text).toMatch(/^You have 2 things to look at:/);

    const raviMsgs = await prisma.outboundMessage.findMany({ where: { recipientUserId: ids.ravi, kind: "reminder" } });
    expect(raviMsgs).toHaveLength(1);
    expect((raviMsgs[0].payload as { text: string }).text).toBe("Still stuck on Maths · Exercise 4.2?");

    // Rerun (or a restart mid-way): ReminderFired keys stop every repeat.
    const second = await runReminders(new Date(), { schoolId: ids.school, settings: DEMO });
    expect(second.counts).toMatchObject({ silent: 0, due_soon: 0, blocked_checkin: 0, overdue: 0 });
    expect(await prisma.outboundMessage.count({ where: { recipientUserId: { in: ids.users }, kind: "reminder" } })).toBe(2);
    expect(await prisma.reminderFired.count({ where: { studentAssignmentId: { in: [ids.ravSa, ...ids.anuSas] } } })).toBe(3);
  });
});
