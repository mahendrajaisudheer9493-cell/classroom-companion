import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { logEvent, type LogContext } from "@/lib/log";

// The one way we call the model: forced tool use → zod validation. Never throws.
// The model interprets; code decides (DESIGN.md §9). Every failure is logged as model.failure
// and returned as { ok: false } so callers fall back to buttons or the app form.

export type ToolCallResult<T> = { ok: true; data: T } | { ok: false; reason: string };

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY, maxRetries: 0 });
  return client;
}

/** JSON Schema for a tool's input, derived from its zod schema (top-level must be an object). */
export function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Tool.InputSchema;
}

export async function callTool<T>(opts: {
  system: string;
  content: string;
  toolName: string;
  toolDescription: string;
  zodSchema: z.ZodType<T>;
  inputSchema?: Anthropic.Tool.InputSchema;
  /** Overrides LLM_TIMEOUT_MS (e.g. 4 s for reminder wording, which has a template to fall back on). */
  timeoutMs?: number;
  maxTokens?: number;
  /** For the model.failure log, e.g. "parse_teacher". */
  purpose: string;
  logContext?: LogContext;
}): Promise<ToolCallResult<T>> {
  const env = getEnv();
  const started = Date.now();
  const fail = async (reason: string, detail?: unknown): Promise<ToolCallResult<T>> => {
    await logEvent(
      "model.failure",
      { purpose: opts.purpose, reason, model: env.ANTHROPIC_MODEL, ...(detail ? { detail } : {}) },
      opts.logContext,
    );
    await logCall({ task: opts.purpose, outcome: "failure", ms: Date.now() - started, reason }, opts.logContext);
    return { ok: false, reason };
  };
  const succeed = async (data: T): Promise<ToolCallResult<T>> => {
    // intent/confidence only when the task has them (parsing); never the message text or names.
    const d = data as { intent?: unknown; confidence?: unknown };
    const intent = typeof d.intent === "string" ? d.intent : undefined;
    const confidence = typeof d.confidence === "number" ? d.confidence : undefined;
    const outcome = confidence !== undefined && confidence < env.LLM_CONFIDENCE_THRESHOLD ? "low_confidence" : "ok";
    await logCall({ task: opts.purpose, outcome, ms: Date.now() - started, intent, confidence }, opts.logContext);
    return { ok: true, data };
  };

  // One retry, and only for network errors (not timeouts: the user is waiting).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await getClient().messages.create(
        {
          model: env.ANTHROPIC_MODEL,
          max_tokens: opts.maxTokens ?? 2048,
          system: opts.system,
          messages: [{ role: "user", content: opts.content }],
          tools: [
            {
              name: opts.toolName,
              description: opts.toolDescription,
              input_schema: opts.inputSchema ?? toInputSchema(opts.zodSchema),
            },
          ],
          tool_choice: { type: "tool", name: opts.toolName },
        },
        { timeout: opts.timeoutMs ?? env.LLM_TIMEOUT_MS, maxRetries: 0 },
      );

      if (response.stop_reason === "refusal") return fail("refusal");
      const block = response.content.find((b) => b.type === "tool_use" && b.name === opts.toolName);
      if (!block || block.type !== "tool_use") return fail("no_tool_call", { stop_reason: response.stop_reason });

      const parsed = opts.zodSchema.safeParse(block.input);
      if (!parsed.success) return fail("invalid_output", { issues: parsed.error.issues.slice(0, 5) });
      return succeed(parsed.data);
    } catch (err) {
      if (err instanceof Anthropic.APIConnectionTimeoutError) return fail("timeout");
      if (err instanceof Anthropic.APIConnectionError) {
        if (attempt === 0) continue;
        return fail("network_error", { message: err.message });
      }
      if (err instanceof Anthropic.RateLimitError) return fail("rate_limited");
      if (err instanceof Anthropic.APIError) return fail(`api_error_${err.status ?? "unknown"}`, { message: err.message });
      return fail("unexpected_error", { message: err instanceof Error ? err.message : String(err) });
    }
  }
  return fail("network_error");
}

/** `llm.call`: one line per model call (task, outcome, ms, intent, confidence). No message text, no names. */
function logCall(
  data: { task: string; outcome: "ok" | "low_confidence" | "failure"; ms: number; intent?: string; confidence?: number; reason?: string },
  context?: LogContext,
) {
  return logEvent("llm.call", data, context);
}

/** Untrusted text goes inside tags; the closing tag is neutralised so it can't break out. */
export function asData(tag: string, text: string): string {
  return `<${tag}>\n${text.replaceAll(`</${tag}>`, `<\\/${tag}>`)}\n</${tag}>`;
}
