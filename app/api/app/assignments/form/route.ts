import type { AssignmentFormResponse } from "@/app/app/_lib/types";
import { assertAccess, canManageClassSubject } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { teachingSlots } from "@/lib/domain/assignments";
import { apiHandler } from "@/lib/http";
import { toIst } from "@/lib/time";

// GET /api/app/assignments/form?draft=<id>: the classes/subjects I teach (+ a draft to prefill).
export const GET = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  const slots = teachingSlots(user);
  assertAccess(slots.length > 0, "Only subject teachers can create assignments.", { actorUserId: user.id });

  const body: AssignmentFormResponse = { options: slots };
  const draftId = new URL(request.url).searchParams.get("draft");
  if (draftId) {
    const draft = await prisma.assignment.findUnique({ where: { id: draftId } });
    if (draft && draft.status === "DRAFT" && canManageClassSubject(user, draft.classId, draft.subject)) {
      const due = toIst(draft.dueAt);
      body.draft = {
        id: draft.id,
        classId: draft.classId,
        subject: draft.subject,
        title: draft.title,
        instructions: draft.instructions,
        notes: draft.notes,
        dueDate: due.toISODate()!,
        dueTime: due.toFormat("HH:mm"),
      };
    }
  }
  return Response.json(body);
});
