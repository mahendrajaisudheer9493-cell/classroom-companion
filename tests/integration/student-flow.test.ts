import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "grammy/types";

// Student chat flows against the dev database, with a throwaway school created and deleted here.
// The model and the Telegram sender are mocked: npm test never calls the real APIs.
const interpret = vi.fn();
vi.mock("@/lib/llm/interpret-student", () => ({ interpretStudentMessage: (...a: unknown[]) => interpret(...a) }));
vi.mock("@/lib/queue/outbound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue/outbound")>()),
  sendDue: vi.fn(async () => ({ sent: 0, failed: 0, dead: 0, deferred: 0 })),
}));

const { prisma } = await import("@/lib/db");
const { createBot } = await import("@/lib/bot/bot");
const { submitWork } = await import("@/lib/domain/student-actions");

const run = Date.now();
const TEACHER_TG = 7_000_000_000n + BigInt(run % 1_000_000_000);
const STUDENT_TG = TEACHER_TG + 1n;
let updateId = 950_000_000 + (run % 1_000_000);

type Call = { method: string; text?: string; buttons: string[] };
const calls: Call[] = [];
const bot = createBot("123:fake-token-for-tests");
bot.botInfo = { id: 1, is_bot: true, first_name: "Bot", username: "test_bot" } as never;
bot.api.config.use(async (_prev, method, payload) => {
  const p = payload as { text?: string; reply_markup?: { inline_keyboard?: { text: string }[][] } };
  calls.push({ method, text: p.text, buttons: p.reply_markup?.inline_keyboard?.flat().map((b) => b.text) ?? [] });
  const result = method === "sendMessage" ? { message_id: 1, date: 0, chat: { id: 1, type: "private" } } : true;
  return { ok: true, result } as never;
});

const from = { id: Number(STUDENT_TG), is_bot: false, first_name: "Test" };
const chat = { id: Number(STUDENT_TG), type: "private" as const, first_name: "Test" };
const text = (t: string): Update => ({ update_id: ++updateId, message: { message_id: 1, date: 0, text: t, from, chat } });
const tap = (data: string): Update => ({
  update_id: ++updateId,
  callback_query: { id: String(updateId), from, chat_instance: "x", data, message: { message_id: 2, date: 0, text: "x", chat } },
});
async function send(update: Update) {
  calls.length = 0;
  await bot.handleUpdate(update);
  return calls.filter((c) => c.method !== "sendChatAction");
}

let ids: { school: string; teacher: string; student: string; studentUser: string; assignment: string; sa: string };

describe.skipIf(!process.env.DATABASE_URL)("student chat flows (integration)", () => {
  beforeAll(async () => {
    const school = await prisma.school.create({ data: { name: `ZZ Test ${run}` } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "9Z", grade: 9 } });
    const teacher = await prisma.user.create({ data: { telegramId: TEACHER_TG, chatId: TEACHER_TG, displayName: "Test Teacher" } });
    await prisma.membership.create({ data: { userId: teacher.id, schoolId: school.id, classId: klass.id, role: "SUBJECT_TEACHER", subject: "Maths" } });
    const studentUser = await prisma.user.create({ data: { telegramId: STUDENT_TG, chatId: STUDENT_TG, displayName: "Test" } });
    const student = await prisma.student.create({
      data: { schoolId: school.id, classId: klass.id, name: "Ravi Test", rollNo: "1", userId: studentUser.id, linkedAt: new Date() },
    });
    const assignment = await prisma.assignment.create({
      data: {
        schoolId: school.id,
        classId: klass.id,
        subject: "Maths",
        createdByUserId: teacher.id,
        title: "Exercise 4.2",
        instructions: "Do q1 to q8",
        dueAt: new Date(Date.now() + 3 * 86_400_000),
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    const sa = await prisma.studentAssignment.create({ data: { assignmentId: assignment.id, studentId: student.id, deliveredAt: new Date() } });
    ids = { school: school.id, teacher: teacher.id, student: student.id, studentUser: studentUser.id, assignment: assignment.id, sa: sa.id };
  });

  beforeEach(async () => {
    interpret.mockReset();
    await prisma.submission.deleteMany({ where: { studentAssignmentId: ids.sa } });
    await prisma.studentAssignment.update({ where: { id: ids.sa }, data: { status: "ASSIGNED", blockedAt: null } });
    await prisma.assignment.update({ where: { id: ids.assignment }, data: { status: "PUBLISHED" } });
  });

  afterAll(async () => {
    if (!ids) return;
    const users = [ids.teacher, ids.studentUser];
    await prisma.outboundMessage.deleteMany({ where: { chatId: { in: [TEACHER_TG, STUDENT_TG] } } });
    await prisma.activityEvent.deleteMany({ where: { schoolId: ids.school } });
    await prisma.submission.deleteMany({ where: { studentAssignmentId: ids.sa } });
    await prisma.doubtMessage.deleteMany({ where: { studentAssignmentId: ids.sa } });
    await prisma.studentAssignment.deleteMany({ where: { assignmentId: ids.assignment } });
    await prisma.assignment.deleteMany({ where: { schoolId: ids.school } });
    await prisma.pendingAction.deleteMany({ where: { userId: { in: users } } });
    await prisma.student.deleteMany({ where: { schoolId: ids.school } });
    await prisma.membership.deleteMany({ where: { schoolId: ids.school } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.class.deleteMany({ where: { schoolId: ids.school } });
    await prisma.school.delete({ where: { id: ids.school } });
    await prisma.processedUpdate.deleteMany({ where: { updateId: { gte: 950_000_000n, lt: 960_000_000n } } });
  });

  it("low confidence → choice buttons, nothing changes", async () => {
    interpret.mockResolvedValue({ ok: true, data: { intent: "progress", assignmentId: ids.sa, doubtText: null, confidence: 0.3 } });
    const replies = await send(text("hmm idk"));
    expect(replies[0].text).toBe("I'm not sure what you mean.");
    expect(replies[0].buttons).toEqual(["I'm stuck", "Making progress", "Done", "Open my work"]);
    expect((await prisma.studentAssignment.findUniqueOrThrow({ where: { id: ids.sa } })).status).toBe("ASSIGNED");
  });

  it("model failure → the same choice buttons (never guesses)", async () => {
    interpret.mockResolvedValue({ ok: false, reason: "timeout" });
    const replies = await send(text("done"));
    expect(replies[0].text).toBe("I'm not sure what you mean.");
  });

  it("blocked → BLOCKED, doubt saved, teacher alert queued (no quiet hours)", async () => {
    interpret.mockResolvedValue({ ok: true, data: { intent: "blocked", assignmentId: ids.sa, doubtText: "stuck on q5 formula", confidence: 0.9 } });
    const replies = await send(text("stuck on q5 formula"));
    expect(replies[0].text).toBe("Marked as stuck on Maths · Exercise 4.2. Your teacher has been notified.");

    const sa = await prisma.studentAssignment.findUniqueOrThrow({ where: { id: ids.sa } });
    expect(sa.status).toBe("BLOCKED");
    expect(sa.blockedAt).not.toBeNull();
    const doubt = await prisma.doubtMessage.findFirstOrThrow({ where: { studentAssignmentId: ids.sa }, orderBy: { createdAt: "desc" } });
    expect(doubt).toMatchObject({ authorRole: "STUDENT", text: "stuck on q5 formula" });
    const alert = await prisma.outboundMessage.findFirstOrThrow({ where: { chatId: TEACHER_TG, kind: "doubt.alert" }, orderBy: { createdAt: "desc" } });
    expect(alert.toStudent).toBe(false);
    expect((alert.payload as { text: string }).text).toBe('🆘 Ravi Test (9Z) is stuck on Maths · Exercise 4.2: "stuck on q5 formula"');
  });

  it("the same file submitted twice → one Submission", async () => {
    const file = { fileId: "file-1", fileUniqueId: `uniq-${run}` };
    const first = await submitWork({ id: ids.studentUser, student: { id: ids.student } }, ids.sa, { kind: "PHOTO", file });
    const second = await submitWork({ id: ids.studentUser, student: { id: ids.student } }, ids.sa, { kind: "PHOTO", file });
    expect("status" in first && first.status).toBe("submitted");
    expect("status" in second && second.status).toBe("duplicate");
    expect(await prisma.submission.count({ where: { studentAssignmentId: ids.sa } })).toBe(1);
    expect((await prisma.studentAssignment.findUniqueOrThrow({ where: { id: ids.sa } })).status).toBe("SUBMITTED");
  });

  it("a submission for a cancelled assignment is refused", async () => {
    await prisma.assignment.update({ where: { id: ids.assignment }, data: { status: "CANCELLED" } });
    const r = await submitWork({ id: ids.studentUser, student: { id: ids.student } }, ids.sa, { kind: "IN_CLASS" });
    expect(r).toMatchObject({ status: "closed", reason: "cancelled" });
    expect(await prisma.submission.count({ where: { studentAssignmentId: ids.sa } })).toBe(0);
  });

  it("an expired or already-used PendingAction button does nothing", async () => {
    const expired = await prisma.pendingAction.create({
      data: { userId: ids.studentUser, kind: "student.confirm_text", payload: { saId: ids.sa, text: "my answer" }, expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredAnswer = [{ method: "answerCallbackQuery", text: "This option has expired.", buttons: [] }];
    let replies = await send(tap(`sy:${expired.id}`));
    expect(replies).toEqual(expiredAnswer);
    expect(await prisma.submission.count({ where: { studentAssignmentId: ids.sa } })).toBe(0);

    const fresh = await prisma.pendingAction.create({
      data: { userId: ids.studentUser, kind: "student.confirm_text", payload: { saId: ids.sa, text: "my answer" }, expiresAt: new Date(Date.now() + 60_000) },
    });
    await send(tap(`sy:${fresh.id}`)); // used once → submits
    replies = await send(tap(`sy:${fresh.id}`)); // second tap
    expect(replies).toEqual(expiredAnswer);
    expect(await prisma.submission.count({ where: { studentAssignmentId: ids.sa } })).toBe(1);
  });
});
