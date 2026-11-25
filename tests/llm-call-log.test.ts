import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Every model call is logged as llm.call { task, intent, confidence, ms, outcome } without the
// message text. The Anthropic SDK is mocked.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class APIConnectionError extends APIError {}
  class APIConnectionTimeoutError extends APIConnectionError {}
  class RateLimitError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static APIConnectionError = APIConnectionError;
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    static RateLimitError = RateLimitError;
    messages = { create: (...a: unknown[]) => create(...a) };
  }
  return { default: Anthropic };
});
const logEvent = vi.fn(async () => {});
vi.mock("@/lib/log", () => ({ logEvent: (...a: unknown[]) => logEvent(...(a as [])) }));

const { callTool } = await import("@/lib/llm/client");
const Anthropic = (await import("@anthropic-ai/sdk")).default as unknown as { APIConnectionTimeoutError: new (m: string) => Error };

const schema = z.object({ intent: z.string(), confidence: z.number() });
const SECRET = "Ravi Kumar says stuck on q5";
const call = () =>
  callTool({ system: "s", content: SECRET, toolName: "t", toolDescription: "d", zodSchema: schema, purpose: "parse_teacher", logContext: { schoolId: "s1" } });
const toolUse = (input: unknown) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "t", input }] });
const llmCalls = () => logEvent.mock.calls.filter((c) => (c as unknown[])[0] === "llm.call").map((c) => (c as unknown[])[1] as Record<string, unknown>);

describe("llm.call logging", () => {
  beforeEach(() => {
    create.mockReset();
    logEvent.mockClear();
  });

  it("ok: task, intent, confidence, ms, outcome; never the message text", async () => {
    create.mockResolvedValue(toolUse({ intent: "create", confidence: 0.95 }));
    await call();
    const [log] = llmCalls();
    expect(log).toMatchObject({ task: "parse_teacher", intent: "create", confidence: 0.95, outcome: "ok" });
    expect(typeof log.ms).toBe("number");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("Ravi");
  });

  it("low_confidence when below the threshold", async () => {
    create.mockResolvedValue(toolUse({ intent: "other", confidence: 0.3 }));
    await call();
    expect(llmCalls()[0]).toMatchObject({ outcome: "low_confidence", intent: "other", confidence: 0.3 });
  });

  it("failure on timeout or invalid output (plus model.failure)", async () => {
    create.mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError("timeout"));
    await call();
    create.mockResolvedValueOnce(toolUse({ nope: true }));
    await call();
    expect(llmCalls().map((l) => [l.outcome, l.reason])).toEqual([
      ["failure", "timeout"],
      ["failure", "invalid_output"],
    ]);
    expect(logEvent.mock.calls.filter((c) => (c as unknown[])[0] === "model.failure")).toHaveLength(2);
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("stuck on q5");
  });
});
