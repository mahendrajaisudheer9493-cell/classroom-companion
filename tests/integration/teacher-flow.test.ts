import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Teacher actions from the Mini App against the dev database (throwaway school, cleaned up).
// Telegram sending is mocked; quiet hours are forced on for this file.
process.env.QUIET_HOURS_ENABLED = "true";
vi.mock("@/lib/queue/outbound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue/outbound")>()),
  sendDue: vi.fn(async () => ({ sent: 0, failed: 0, dead: 0, deferred: 0 })),
}));

const { prisma } = await import("@/lib/db");
const { getEnv } = await import("@/lib/env");
const { signInitData } = await import("@/lib/auth/init-data");
const { loadAppUserById } = await import("@/lib/auth/user");
const { giveFeedback, replyToDoubt } = await import("@/lib/domain/teacher-actions");
const reviewRoute = await import("@/app/api/app/review/[saId]/route");
const filesRoute = await import("@/app/api/files/[submissionId]/route");

const run = Date.now();
const base = 5_000_000_000n + BigInt(run % 1_000_000_000);
const TG = { teacher: base, classTeacher: base + 1n, ravi: base + 2n, anu: base + 3n };
type Ids = { school: string; teacher: string; classTeacher: string; ravi: string; anu: string; assignment: string; raviSa: string; anuSa: string; anuFile: string };
let ids: Ids;

const auth = (telegramId: bigint) => ({ Authorization: `tma ${signInitData({ id: Number(telegramId), first_name: "T" }, getEnv().TELEGRAM_BOT_TOKEN)}` });
const routeCtx = <T extends object>(params: T) => ({ params: Promise.resolve(params) });

describe.skipIf(!process.env.DATABASE_URL)("teacher actions (integration)", () => {
  beforeAll(async () => {
    const school = await prisma.school.create({ data: { name: `ZZ Test T ${run}` } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "9Y", grade: 9 } });
    const mk = (tg: bigint, name: string) => prisma.user.create({ data: { telegramId: tg, chatId: tg, displayName: name } });
    const teacher = await mk(TG.teacher, "Mrs. Rao");
    const classTeacher = await mk(TG.classTeacher, "Mr. Class");
    const raviUser = await mk(TG.ravi, "Ravi");
    const anuUser = await mk(TG.anu, "Anu");
    await prisma.membership.create({ data: { userId: teacher.id, schoolId: school.id, classId: klass.id, role: "SUBJECT_TEACHER", subject: "Maths" } });
    await prisma.membership.create({ data: { userId: classTeacher.id, schoolId: school.id, classId: klass.id, role: "CLASS_TEACHER" } });
    const ravi = await prisma.student.create({ data: { schoolId: school.id, classId: klass.id, name: "Ravi", rollNo: "1", userId: raviUser.id } });
    const anu = await prisma.student.create({ data: { schoolId: school.id, classId: klass.id, name: "Anu", rollNo: "2", userId: anuUser.id } });
    const a = await prisma.assignment.create({
      data: {
        schoolId: school.id, classId: klass.id, subject: "Maths", createdByUserId: teacher.id, title: "Exercise 4.2",
        instructions: "q1-q8", dueAt: new Date(Date.now() + 2 * 86_400_000), status: "PUBLISHED", publishedAt: new Date(),
      },
    });
    const raviSa = await prisma.studentAssignment.create({ data: { assignmentId: a.id, studentId: ravi.id, status: "SUBMITTED", deliveredAt: new Date() } });
    const anuSa = await prisma.studentAssignment.create({ data: { assignmentId: a.id, studentId: anu.id, status: "SUBMITTED", deliveredAt: new Date() } });
    await prisma.submission.create({ data: { studentAssignmentId: raviSa.id, kind: "TEXT", text: "my answers" } });
    const anuFile = await prisma.submission.create({
      data: { studentAssignmentId: anuSa.id, kind: "PHOTO", telegramFileId: "fake-file-id", telegramFileUniqueId: `u-${run}`, mimeType: "image/jpeg" },
    });
    ids = {
      school: school.id, teacher: teacher.id, classTeacher: classTeacher.id, ravi: raviUser.id, anu: anuUser.id,
      assignment: a.id, raviSa: raviSa.id, anuSa: anuSa.id, anuFile: anuFile.id,
    };
  });

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    if (!ids) return;
    const users = [ids.teacher, ids.classTeacher, ids.ravi, ids.anu];
    await prisma.outboundMessage.deleteMany({ where: { recipientUserId: { in: users } } });
    await prisma.activityEvent.deleteMany({ where: { schoolId: ids.school } });
    await prisma.feedback.deleteMany({ where: { studentAssignmentId: { in: [ids.raviSa, ids.anuSa] } } });
    await prisma.submission.deleteMany({ where: { studentAssignmentId: { in: [ids.raviSa, ids.anuSa] } } });
    await prisma.doubtMessage.deleteMany({ where: { studentAssignmentId: { in: [ids.raviSa, ids.anuSa] } } });
    await prisma.studentAssignment.deleteMany({ where: { assignmentId: ids.assignment } });
    await prisma.assignment.deleteMany({ where: { schoolId: ids.school } });
    await prisma.student.deleteMany({ where: { schoolId: ids.school } });
    await prisma.membership.deleteMany({ where: { schoolId: ids.school } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.class.deleteMany({ where: { schoolId: ids.school } });
    await prisma.school.delete({ where: { id: ids.school } });
  });

  it("feedback 'needs revision' → NEEDS_REVISION, Feedback row, message with [Resubmit] queued", async () => {
    const teacher = (await loadAppUserById(ids.teacher))!;
    const r = await giveFeedback(teacher, ids.raviSa, { result: "NEEDS_REVISION", comment: "Show your working for q5" });
    expect(r.status).toBe("sent");
    expect((await prisma.studentAssignment.findUniqueOrThrow({ where: { id: ids.raviSa } })).status).toBe("NEEDS_REVISION");
    const fb = await prisma.feedback.findFirstOrThrow({ where: { studentAssignmentId: ids.raviSa } });
    expect(fb).toMatchObject({ result: "NEEDS_REVISION", comment: "Show your working for q5", teacherUserId: ids.teacher });
    const msg = await prisma.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `fb:${fb.id}` } });
    const payload = msg.payload as { text: string; reply_markup: { inline_keyboard: { text: string }[][] } };
    expect(payload.text).toBe('Mrs. Rao reviewed Maths · Exercise 4.2. Needs revision: "Show your working for q5"');
    expect(payload.reply_markup.inline_keyboard.flat().map((b) => b.text)).toEqual(["Resubmit", "Open"]);
    // a second review of the same submission is refused (nothing waiting)
    expect((await giveFeedback(teacher, ids.raviSa, { result: "COMPLETED", comment: "" })).status).toBe("not_submitted");
  });

  it("a reply at 22:30 IST is queued for 07:00 IST the next morning", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T17:00:00Z")); // 22:30 IST
    const teacher = (await loadAppUserById(ids.teacher))!;
    const r = await replyToDoubt(teacher, ids.anuSa, "Use the formula on page 64");
    expect(r.deliverAt?.toISOString()).toBe("2026-11-18T01:30:00.000Z"); // 07:00 IST
    const msg = await prisma.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `reply:${r.doubtMessageId}` } });
    expect(msg.sendAfter.toISOString()).toBe("2026-11-18T01:30:00.000Z");
    expect(msg.toStudent).toBe(true);
  });

  it("a student cannot open another student's file (403)", async () => {
    const req = new Request(`http://test/api/files/${ids.anuFile}`, { headers: auth(TG.ravi) });
    const res = await filesRoute.GET(req, routeCtx({ submissionId: ids.anuFile }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden" });
  });

  it("the class teacher can read the review but cannot post feedback (403)", async () => {
    const get = await reviewRoute.GET(new Request(`http://test/api/app/review/${ids.anuSa}`, { headers: auth(TG.classTeacher) }), routeCtx({ saId: ids.anuSa }));
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ canReview: false });

    const post = await reviewRoute.POST(
      new Request(`http://test/api/app/review/${ids.anuSa}`, {
        method: "POST",
        headers: { ...auth(TG.classTeacher), "Content-Type": "application/json" },
        body: JSON.stringify({ result: "COMPLETED", comment: "" }),
      }),
      routeCtx({ saId: ids.anuSa }),
    );
    expect(post.status).toBe(403);
    expect((await prisma.studentAssignment.findUniqueOrThrow({ where: { id: ids.anuSa } })).status).toBe("SUBMITTED");
  });
});
