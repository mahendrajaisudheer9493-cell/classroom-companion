import { beforeEach, describe, expect, it, vi } from "vitest";

// phraseReminder with the model mocked: good lines are used; anything unsafe → the template.
const callTool = vi.fn();
const logEvent = vi.fn(async () => {});
vi.mock("@/lib/llm/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/client")>()),
  callTool: (...args: unknown[]) => callTool(...args),
}));
vi.mock("@/lib/log", () => ({ logEvent: (...args: unknown[]) => logEvent(...(args as [])) }));

const { checkReminderText, phraseReminder } = await import("@/lib/llm/phrase");

const input = { kind: "silent" as const, studentFirstName: "Anu", subject: "Maths", title: "Exercise 4.2", dueText: "Thu 19 Nov, 8:00 am" };
const TEMPLATE = "Did you see Maths · Exercise 4.2? Due Thu 19 Nov, 8:00 am.";
const others = { otherNames: ["Ravi Kumar", "Ravi", "Meera Iyer", "Meera"] };
const modelSays = (text: string) => callTool.mockResolvedValueOnce({ ok: true, data: { text } });

describe("phraseReminder", () => {
  beforeEach(() => {
    callTool.mockReset();
    logEvent.mockClear();
  });

  it("uses a good model line", async () => {
    modelSays("Hi Anu! Did you get a chance to look at Exercise 4.2? It's due Thu 19 Nov, 8:00 am.");
    const r = await phraseReminder(input, TEMPLATE, others);
    expect(r.wording).toBe("llm");
    expect(r.text).toContain("Exercise 4.2");
    expect(callTool.mock.calls[0][0]).toMatchObject({ timeoutMs: 4000, purpose: "phrase_reminder" });
  });

  it("a URL in the output → template + model.failure", async () => {
    modelSays("Hi Anu, see Exercise 4.2 at https://example.com before Thu!");
    expect(await phraseReminder(input, TEMPLATE, others)).toEqual({ text: TEMPLATE, wording: "template" });
    expect(logEvent).toHaveBeenCalledWith("model.failure", expect.objectContaining({ reason: "contains_url" }), undefined);
  });

  it("another student's name in the output → template + model.failure", async () => {
    modelSays("Hi Anu, Ravi already finished Exercise 4.2, you can too!");
    expect(await phraseReminder(input, TEMPLATE, others)).toEqual({ text: TEMPLATE, wording: "template" });
    expect(logEvent).toHaveBeenCalledWith("model.failure", expect.objectContaining({ reason: "other_student_name" }), undefined);
  });

  it("model timeout or invalid output → template", async () => {
    callTool.mockResolvedValueOnce({ ok: false, reason: "timeout" });
    expect(await phraseReminder(input, TEMPLATE, others)).toEqual({ text: TEMPLATE, wording: "template" });
  });

  it("checks: length, links, title present, other names", () => {
    const opts = { title: "Exercise 4.2", ...others };
    expect(checkReminderText("Exercise 4.2 is due soon, Anu!", opts)).toBeNull();
    expect(checkReminderText(`Exercise 4.2 ${"a".repeat(400)}`, opts)).toBe("too_long");
    expect(checkReminderText("Open t.me/somebot for Exercise 4.2", opts)).toBe("contains_url");
    expect(checkReminderText("Check www.site.in for Exercise 4.2", opts)).toBe("contains_url");
    expect(checkReminderText("Your maths homework is due soon.", opts)).toBe("missing_title");
    expect(checkReminderText("Exercise 4.2: ask meera if stuck", opts)).toBe("other_student_name");
    expect(checkReminderText("Exercise 4.2: bravissimo!", opts)).toBeNull(); // "Ravi" only as a whole word
  });
});
