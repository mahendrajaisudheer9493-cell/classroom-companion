import type { WorkResponse } from "@/app/app/_lib/types";
import { assertAccess, canViewStudentAssignment } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { HttpError, apiHandler } from "@/lib/http";
import { formatIst } from "@/lib/time";

// GET /api/app/work/:saId: one student's assignment. Owner / subject teacher / class teacher → full;
// coordinator → status only; anyone else → 403.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/work/[saId]">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const sa = await prisma.studentAssignment.findUnique({
    where: { id: saId },
    include: { student: true, assignment: { include: { class: true } } },
  });
  if (!sa || sa.assignment.status === "DRAFT") throw new HttpError(404, { error: "not_found", message: "Assignment not found." });

  const { assignment } = sa;
  const level = canViewStudentAssignment(user, { studentId: sa.studentId, assignment });
  assertAccess(level !== "none", "You can only see your own work.", {
    schoolId: assignment.schoolId,
    classId: assignment.classId,
    actorUserId: user.id,
  });

  const body: WorkResponse = {
    level: level as "full" | "status",
    subject: assignment.subject,
    title: assignment.title,
    className: assignment.class.name,
    studentName: sa.student.name,
    dueLabel: formatIst(assignment.dueAt),
    status: sa.status,
    cancelled: assignment.status === "CANCELLED",
    seenLatest: sa.ackedVersion === assignment.version,
    ...(level === "full" ? { instructions: assignment.instructions, notes: assignment.notes } : {}),
  };
  return Response.json(body);
});
