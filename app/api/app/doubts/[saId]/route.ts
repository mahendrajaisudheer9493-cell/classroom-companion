import type { DoubtThreadResponse } from "@/app/app/_lib/types";
import { assertAccess, canManageClassSubject, canViewClassFull } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { assignmentLabel } from "@/lib/bot/cards";
import { prisma } from "@/lib/db";
import { HttpError, apiHandler } from "@/lib/http";

// GET /api/app/doubts/:saId: the private doubt thread for one student-assignment.
// The student who owns it, the subject teacher, and the class teacher (read-only) may see it.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/doubts/[saId]">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const sa = await prisma.studentAssignment.findUnique({
    where: { id: saId },
    include: {
      assignment: true,
      student: { include: { class: true } },
      doubtMessages: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!sa) throw new HttpError(404, { error: "not_found", message: "Not found." });
  const { assignment } = sa;
  const allowed =
    user.student?.id === sa.studentId ||
    canManageClassSubject(user, assignment.classId, assignment.subject) ||
    canViewClassFull(user, assignment.classId);
  assertAccess(allowed, "You can only see doubts for your own classes and subjects.", {
    schoolId: assignment.schoolId,
    classId: assignment.classId,
    actorUserId: user.id,
  });

  const body: DoubtThreadResponse = {
    studentName: sa.student.name,
    className: sa.student.class.name,
    assignment: assignmentLabel(assignment),
    status: sa.status,
    messages: sa.doubtMessages.map((m) => ({
      id: m.id,
      from: m.authorRole,
      author: m.authorRole === "STUDENT" ? sa.student.name : m.author.displayName,
      text: m.text,
      at: m.createdAt.toISOString(),
    })),
  };
  return Response.json(body);
});
