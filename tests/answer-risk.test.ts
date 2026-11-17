import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RiskStudentDto } from "@/app/app/_lib/types";

// answerRisk with the model mocked: names and numbers must come from the facts, else the template.
const callTool = vi.fn();
const logEvent = vi.fn(async () => {});
vi.mock("@/lib/llm/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/client")>()),
  callTool: (...args: unknown[]) => callTool(...args),
}));
vi.mock("@/lib/log", () => ({ logEvent: (...args: unknown[]) => logEvent(...(args as [])) }));

const { answerRisk, riskTemplate, NOBODY } = await import("@/lib/llm/answer-risk");

const facts: RiskStudentDto[] = [
  { studentId: "s1", name: "Sneha Iyer", className: "8A", signals: ["overdue", "silent"], reasons: ["overdue: Maths · Exercise 4.1", "silent: Maths · Exercise 4.1"] },
  { studentId: "s2", name: "Kiran Patel", className: "8A", signals: ["overdue", "many_overdue"], reasons: ["overdue ×2: Maths · Exercise 4.1, English · Grammar worksheet 3"] },
];
const roster = ["Sneha Iyer", "Kiran Patel", "Ravi Kumar", "Anu Reddy"];
const modelSays = (lines: { student: string; note: string }[]) => callTool.mockResolvedValueOnce({ ok: true, data: { lines } });
const TEMPLATE = riskTemplate(facts);

describe("answerRisk", () => {
  beforeEach(() => {
    callTool.mockReset();
    logEvent.mockClear();
  });

  it("uses the model's lines when every name and number is in the facts", async () => {
    modelSays([
      { student: "Kiran Patel", note: "2 items overdue (Maths 4.1, English worksheet 3)" },
      { student: "Sneha Iyer", note: "hasn't opened Exercise 4.1, now overdue" },
    ]);
    const r = await answerRisk("who is at risk this week?", facts, { rosterNames: roster });
    expect(r.wording).toBe("llm");
    expect(r.text).toBe("• Kiran Patel (8A): 2 items overdue (Maths 4.1, English worksheet 3)\n• Sneha Iyer (8A): hasn't opened Exercise 4.1, now overdue");
  });

  it("the model adds a student who isn't in the facts → template + model.failure", async () => {
    modelSays([
      { student: "Sneha Iyer", note: "overdue on Exercise 4.1" },
      { student: "Ravi Kumar", note: "seems behind" },
    ]);
    expect(await answerRisk("who is at risk?", facts, { rosterNames: roster })).toEqual({ text: TEMPLATE, wording: "template" });
    expect(logEvent).toHaveBeenCalledWith("model.failure", { purpose: "answer_risk", reason: "unknown_student" }, undefined);
  });

  it("another student's name inside a note → template", async () => {
    modelSays([{ student: "Sneha Iyer", note: "overdue, like Ravi" }]);
    expect((await answerRisk("who?", facts, { rosterNames: roster })).wording).toBe("template");
    expect(logEvent).toHaveBeenCalledWith("model.failure", expect.objectContaining({ reason: "other_student_name" }), undefined);
  });

  it("a number that isn't in the facts → template", async () => {
    modelSays([{ student: "Kiran Patel", note: "5 items overdue" }]);
    expect((await answerRisk("who?", facts, { rosterNames: roster })).wording).toBe("template");
    expect(logEvent).toHaveBeenCalledWith("model.failure", expect.objectContaining({ reason: "unknown_number" }), undefined);
  });

  it("no facts → 'Nobody looks at risk this week ✓' without calling the model", async () => {
    expect(await answerRisk("who is at risk?", [], { rosterNames: roster })).toEqual({ text: NOBODY, wording: "none" });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("model failure → template; the template never goes over 6 lines", async () => {
    callTool.mockResolvedValueOnce({ ok: false, reason: "timeout" });
    expect((await answerRisk("who?", facts, { rosterNames: roster })).text).toBe(
      "• Sneha Iyer (8A): overdue: Maths · Exercise 4.1; silent: Maths · Exercise 4.1\n• Kiran Patel (8A): overdue ×2: Maths · Exercise 4.1, English · Grammar worksheet 3",
    );
    const many = Array.from({ length: 9 }, (_, i) => ({ ...facts[0], studentId: `x${i}`, name: `Student ${i}` }));
    const lines = riskTemplate(many).split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe("…and 4 more on the triage board");
  });
});
