import { z } from "zod";
import type { CreateAssignmentResponse } from "@/app/app/_lib/types";
import { getRequestUser } from "@/lib/auth/request-user";
import { resolveDue } from "@/lib/domain/assignment-draft";
import { publishAssignment, publishSummary, saveDraft } from "@/lib/domain/assignments";
import { HttpError, apiHandler } from "@/lib/http";
import { nowIst } from "@/lib/time";

const bodySchema = z.object({
  draftId: z.string().optional(),
  classId: z.string().min(1),
  subject: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(120),
  instructions: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(1000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due date"),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a due time"),
});

// POST /api/app/assignments: the "Create in app" form (no LLM). Same publish path as [Send] in chat.
export const POST = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new HttpError(400, { error: "invalid", message: parsed.error.issues[0]?.message ?? "Check the form." });
  }
  const b = parsed.data;

  const due = resolveDue({ dueDate: b.dueDate, explicitTime: b.dueTime, timeOfDay: null }, nowIst());
  if (due.kind === "past") throw new HttpError(400, { error: "past_due", message: "That time has already passed. Pick a later due time." });
  if (due.kind !== "ok") throw new HttpError(400, { error: "invalid", message: "Pick a due date and time." });

  const draft = await saveDraft(user, b.draftId ?? null, {
    classId: b.classId,
    subject: b.subject,
    title: b.title,
    instructions: b.instructions,
    notes: b.notes ?? null,
    dueAt: due.dueAt.toJSDate(),
    sourceText: null,
  });
  if (!draft) throw new HttpError(409, { error: "not_draft", message: "This draft was already sent or deleted." });

  const result = await publishAssignment(user, draft.id);
  if (result.status !== "published") throw new HttpError(409, { error: result.status, message: "This assignment was already sent." });
  const body: CreateAssignmentResponse = { assignmentId: draft.id, message: publishSummary(result) };
  return Response.json(body);
});
