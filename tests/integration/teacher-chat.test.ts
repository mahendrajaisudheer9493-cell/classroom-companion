import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "grammy/types";
import { DateTime } from "luxon";

// Teacher chat: a clear assignment with missing details is ASKED about (subject → class → time),
// never rejected; a model failure gets its own reply. The model is mocked; the dev DB holds a
// throwaway school that is deleted afterwards.
const parse = vi.fn();
vi.mock("@/lib/llm/parse-teacher", () => ({ parseTeacherMessage: (...a: unknown[]) => parse(...a) }));
vi.mock("@/lib/queue/outbound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue/outbound")>()),
  sendDue: vi.fn(async () => ({ sent: 0, failed: 0, dead: 0, deferred: 0 })),
}));

const { prisma } = await import("@/lib/db");
const { createBot } = await import("@/lib/bot/bot");

const run = Date.now();
const TEACHER_TG = 8_000_000_000n + BigInt(run % 1_000_000_000);
let updateId = 960_000_000 + (run % 1_000_000);

type Call = { method: string; text?: string; buttons: { text: string; data?: string }[] };
const calls: Call[] = [];
const bot = createBot("123:fake-token-for-tests");
bot.botInfo = { id: 1, is_bot: true, first_name: "Bot", username: "test_bot" } as never;
bot.api.config.use(async (_prev, method, payload) => {
  const p = payload as { text?: string; reply_markup?: { inline_keyboard?: { text: string; callback_data?: string }[][] } };
  calls.push({ method, text: p.text, buttons: p.reply_markup?.inline_keyboard?.flat().map((b) => ({ text: b.text, data: b.callback_data })) ?? [] });
  const result = method === "sendMessage" ? { message_id: 1, date: 0, chat: { id: 1, type: "private" } } : true;
  return { ok: true, result } as never;
});

const from = { id: Number(TEACHER_TG), is_bot: false, first_name: "Teacher" };
const chat = { id: Number(TEACHER_TG), type: "private" as const, first_name: "Teacher" };
const text = (t: string): Update => ({ update_id: ++updateId, message: { message_id: 1, date: 0, text: t, from, chat } });
const tap = (data: string): Update => ({
  update_id: ++updateId,
  callback_query: { id: String(updateId), from, chat_instance: "x", data, message: { message_id: 2, date: 0, text: "x", chat } },
});
async function send(update: Update) {
  calls.length = 0;
  await bot.handleUpdate(update);
  return calls.filter((c) => c.method !== "sendChatAction" && c.method !== "answerCallbackQuery");
}
/** The last message with buttons (a question may be sent or edited in place). */
const lastQuestion = (cs: Call[]) => [...cs].reverse().find((c) => c.buttons.length > 0)!;
const button = (c: Call, label: string) => c.buttons.find((b) => b.text === label)!.data!;

const MESSAGE = "do assignment 4.5 1-8 workbook questions by tomorrow along with diagrams";
const tomorrow = DateTime.now().setZone("Asia/Kolkata").plus({ days: 1 }).toISODate()!;
const parsed = {
  intent: "create",
  classNames: [],
  subject: null,
  title: "Assignment 4.5, q1–8",
  instructions: "Workbook questions 1–8 of assignment 4.5, along with diagrams",
  notes: null,
  dueDate: tomorrow,
  timeOfDay: null,
  explicitTime: null,
  assignmentId: null,
  changes: null,
  confidence: 0.95,
};

let ids: { school: string; teacher: string };

describe.skipIf(!process.env.DATABASE_URL)("teacher chat: ask, don't reject (integration)", () => {
  beforeAll(async () => {
    const school = await prisma.school.create({ data: { name: `ZZ Test TC ${run}` } });
    const p = await prisma.class.create({ data: { schoolId: school.id, name: "9P", grade: 9 } });
    const q = await prisma.class.create({ data: { schoolId: school.id, name: "9Q", grade: 9 } });
    const teacher = await prisma.user.create({ data: { telegramId: TEACHER_TG, chatId: TEACHER_TG, displayName: "Mrs. Test" } });
    // Two subjects: Maths in 9P and 9Q, Science in 9P.
    for (const [classId, subject] of [[p.id, "Maths"], [q.id, "Maths"], [p.id, "Science"]]) {
      await prisma.membership.create({ data: { userId: teacher.id, schoolId: school.id, classId, role: "SUBJECT_TEACHER", subject } });
    }
    ids = { school: school.id, teacher: teacher.id };
  });

  beforeEach(() => parse.mockReset());

  afterAll(async () => {
    if (!ids) return;
    await prisma.activityEvent.deleteMany({ where: { schoolId: ids.school } });
    await prisma.assignment.deleteMany({ where: { schoolId: ids.school } });
    await prisma.pendingAction.deleteMany({ where: { userId: ids.teacher } });
    await prisma.membership.deleteMany({ where: { schoolId: ids.school } });
    await prisma.user.deleteMany({ where: { id: ids.teacher } });
    await prisma.class.deleteMany({ where: { schoolId: ids.school } });
    await prisma.school.delete({ where: { id: ids.school } });
    await prisma.processedUpdate.deleteMany({ where: { updateId: { gte: 960_000_000n, lt: 970_000_000n } } });
  });

  it("model failure → 'I'm having trouble right now' (not 'couldn't read')", async () => {
    parse.mockResolvedValue({ ok: false, reason: "timeout" });
    const [reply] = await send(text(MESSAGE));
    expect(reply.text).toBe("I'm having trouble right now. Try again, or create it in the app.");
    expect(reply.buttons.map((b) => b.text)).toEqual(["Create in app"]);
  });

  it("really not an assignment → the 'couldn't read' message", async () => {
    parse.mockResolvedValue({ ok: true, data: { ...parsed, intent: "other", confidence: 0.9 } });
    const [reply] = await send(text("good morning everyone"));
    expect(reply.text).toBe("I couldn't read that as an assignment. Try again, or create it in the app.");
  });

  it(`"${MESSAGE}" → which subject → which class → what time → preview keeping "along with diagrams"`, async () => {
    parse.mockResolvedValue({ ok: true, data: parsed });
    const subjectQ = lastQuestion(await send(text(MESSAGE)));
    expect(subjectQ.text).toBe("Which subject?");
    expect(subjectQ.buttons.map((b) => b.text)).toEqual(["Maths", "Science"]);

    const classQ = lastQuestion(await send(tap(button(subjectQ, "Maths"))));
    expect(classQ.text).toBe("Which class?");
    expect(classQ.buttons.map((b) => b.text)).toEqual(["9P", "9Q", "Both"]);

    const timeQ = lastQuestion(await send(tap(button(classQ, "9P"))));
    expect(timeQ.text).toBe("What time is it due?");
    expect(timeQ.buttons.map((b) => b.text)).toEqual(["8:00 am", "5:00 pm", "Other"]);

    const preview = lastQuestion(await send(tap(button(timeQ, "8:00 am"))));
    expect(preview.text).toContain("Maths · 9P");
    expect(preview.text).toContain("along with diagrams");
    expect(preview.buttons.map((b) => b.text)).toEqual(["Send", "Edit in app", "Cancel"]);
    const draft = await prisma.assignment.findFirstOrThrow({ where: { schoolId: ids.school, status: "DRAFT" } });
    expect(draft.instructions).toContain("along with diagrams");
  });

  it("the model guesses subject 'Maths' but the text names no subject → still asks which subject", async () => {
    parse.mockResolvedValue({ ok: true, data: { ...parsed, subject: "Maths" } });
    const q = lastQuestion(await send(text(MESSAGE)));
    expect(q.text).toBe("Which subject?");
    expect(q.buttons.map((b) => b.text)).toEqual(["Maths", "Science"]);
  });

  it('"maths 4.5 …" names the subject → Maths without asking, straight to the class question', async () => {
    parse.mockResolvedValue({ ok: true, data: { ...parsed, subject: "Maths" } });
    const q = lastQuestion(await send(text(`maths ${MESSAGE.replace("do assignment ", "")}`)));
    expect(q.text).toBe("Which class?");
    expect(q.buttons.map((b) => b.text)).toEqual(["9P", "9Q", "Both"]);
  });

  it("the model guesses a class the text doesn't name → asks which class", async () => {
    parse.mockResolvedValue({ ok: true, data: { ...parsed, subject: "Maths", classNames: ["9Q"] } });
    const q = lastQuestion(await send(text("maths workbook q1-8 by tomorrow")));
    expect(q.text).toBe("Which class?");
  });
});
