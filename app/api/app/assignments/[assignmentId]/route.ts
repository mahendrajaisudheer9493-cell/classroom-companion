import type { AssignmentOverviewResponse } from "@/app/app/_lib/types";
import { assertAccess, canManageClassSubject, canViewClassFull, canViewSchoolStatuses } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { assignmentLabel } from "@/lib/bot/cards";
import { prisma } from "@/lib/db";
import { HttpError, apiHandler } from "@/lib/http";
import { formatIst } from "@/lib/time";

// GET /api/app/assignments/:assignmentId: status counts (full per-student view comes in Task 5).
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/assignments/[assignmentId]">) => {
  const user = await getRequestUser(request);
  const { assignmentId } = await ctx.params;
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: { class: true } });
  if (!a || a.status === "DRAFT") throw new HttpError(404, { error: "not_found", message: "Assignment not found." });
  const allowed =
    canManageClassSubject(user, a.classId, a.subject) || canViewClassFull(user, a.classId) || canViewSchoolStatuses(user, a.schoolId);
  assertAccess(allowed, "You can only see assignments for your own classes.", {
    schoolId: a.schoolId,
    classId: a.classId,
    actorUserId: user.id,
  });

  const groups = await prisma.studentAssignment.groupBy({ by: ["status"], where: { assignmentId: a.id }, _count: { _all: true } });
  const counts = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
  const body: AssignmentOverviewResponse = {
    assignment: assignmentLabel(a),
    className: a.class.name,
    dueLabel: formatIst(a.dueAt),
    status: a.status,
    counts,
    total: groups.reduce((n, g) => n + g._count._all, 0),
  };
  return Response.json(body);
});
