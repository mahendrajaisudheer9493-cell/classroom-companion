import type { AssignmentDetailResponse } from "@/app/app/_lib/types";
import { assertAccess, canManageClassSubject, canViewClassFull, canViewSchoolStatuses } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { flagsFor, type TriageRow } from "@/lib/domain/triage";
import { HttpError, apiHandler } from "@/lib/http";
import { formatIst, toIst } from "@/lib/time";

// GET /api/app/assignments/:id: details + every student's status and flags.
// Subject teacher: full + actions. Class teacher: full, read-only. Coordinator: names + statuses.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/app/assignments/[assignmentId]">) => {
  const user = await getRequestUser(request);
  const { assignmentId } = await ctx.params;
  const a = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: true,
      studentAssignments: {
        include: {
          student: true,
          submissions: { select: { id: true }, take: 1 },
          doubtMessages: { select: { authorRole: true, createdAt: true } },
        },
      },
    },
  });
  if (!a || a.status === "DRAFT") throw new HttpError(404, { error: "not_found", message: "Assignment not found." });

  const canManage = canManageClassSubject(user, a.classId, a.subject);
  const full = canManage || canViewClassFull(user, a.classId);
  assertAccess(full || canViewSchoolStatuses(user, a.schoolId), "You can only see assignments for your own classes.", {
    schoolId: a.schoolId,
    classId: a.classId,
    actorUserId: user.id,
  });

  const now = new Date();
  const latest = (ds: Date[]) => (ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : null);
  const students = a.studentAssignments
    .map((sa) => {
      const row: TriageRow = {
        saId: sa.id,
        studentId: sa.studentId,
        studentName: sa.student.name,
        linked: sa.student.userId !== null,
        classId: a.classId,
        className: a.class.name,
        assignmentId: a.id,
        subject: a.subject,
        title: a.title,
        dueAt: a.dueAt,
        version: a.version,
        status: sa.status,
        ackedVersion: sa.ackedVersion,
        deliveredAt: sa.deliveredAt,
        lastStudentActivityAt: sa.lastStudentActivityAt,
        blockedAt: sa.blockedAt,
        lastStudentDoubtAt: latest(sa.doubtMessages.filter((d) => d.authorRole === "STUDENT").map((d) => d.createdAt)),
        lastTeacherReplyAt: latest(sa.doubtMessages.filter((d) => d.authorRole === "TEACHER").map((d) => d.createdAt)),
        latestSubmissionAt: null,
        latestFeedbackAt: null,
      };
      return {
        saId: sa.id,
        name: sa.student.name,
        rollNo: sa.student.rollNo,
        status: sa.status,
        flags: full ? flagsFor(row, now) : [],
        hasSubmission: full && sa.submissions.length > 0,
      };
    })
    .sort((x, y) => x.rollNo.localeCompare(y.rollNo, undefined, { numeric: true }));

  const counts: Record<string, number> = {};
  for (const s of students) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const due = toIst(a.dueAt);
  const body: AssignmentDetailResponse = {
    id: a.id,
    subject: a.subject,
    title: a.title,
    className: a.class.name,
    instructions: full ? a.instructions : "",
    notes: full ? a.notes : null,
    dueLabel: formatIst(a.dueAt),
    dueDate: due.toISODate()!,
    dueTime: due.toFormat("HH:mm"),
    version: a.version,
    status: a.status,
    canManage: canManage && a.status === "PUBLISHED",
    statusOnly: !full,
    counts,
    students,
  };
  return Response.json(body);
});
