import { DateTime } from "luxon";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the model: npm test never calls the real API.
const callTool = vi.fn();
vi.mock("@/lib/llm/client", () => ({ callTool: (...args: unknown[]) => callTool(...args), asData: (_t: string, s: string) => s }));

const { interpretStudentMessage } = await import("@/lib/llm/interpret-student");

const candidates = [
  { id: "sa_maths", subject: "Maths", title: "Exercise 4.2", dueAt: DateTime.now(), status: "ASSIGNED" },
  { id: "sa_lab", subject: "Science", title: "Lab report", dueAt: DateTime.now(), status: "ASSIGNED" },
];

describe("interpretStudentMessage", () => {
  beforeEach(() => callTool.mockReset());

  it("keeps an assignment id that is one of the candidates", async () => {
    callTool.mockResolvedValue({ ok: true, data: { intent: "progress", assignmentId: "sa_lab", doubtText: null, confidence: 0.9 } });
    const r = await interpretStudentMessage("lab half done", candidates);
    expect(r.ok && r.data.assignmentId).toBe("sa_lab");
  });

  it("treats an id that is NOT in the candidates as null (never trusted)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { intent: "blocked", assignmentId: "someone_elses_sa", doubtText: "q5", confidence: 0.9 } });
    const r = await interpretStudentMessage("stuck on q5", candidates);
    expect(r.ok && r.data).toEqual({ intent: "blocked", assignmentId: null, doubtText: "q5", confidence: 0.9 });
  });

  it("passes model failures through as { ok: false }", async () => {
    callTool.mockResolvedValue({ ok: false, reason: "timeout" });
    expect(await interpretStudentMessage("hi", candidates)).toEqual({ ok: false, reason: "timeout" });
  });
});
