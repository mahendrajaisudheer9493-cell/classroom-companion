import { loadClassForRoster } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { unlinkStudent } from "@/lib/domain/linking";
import { HttpError, apiHandler } from "@/lib/http";
import { logEvent } from "@/lib/log";

// POST /api/app/classes/:classId/students/:studentId/unlink: free a wrongly claimed name.
// Safe to repeat: unlinking an unlinked student is a no-op.
export const POST = apiHandler(
  async (request, ctx: RouteContext<"/api/app/classes/[classId]/students/[studentId]/unlink">) => {
    const user = await getRequestUser(request);
    const { classId, studentId } = await ctx.params;
    const klass = await loadClassForRoster(user, classId);

    // The student must be in THIS class (the access check above was for the class).
    const student = await prisma.student.findFirst({ where: { id: studentId, classId: klass.id } });
    if (!student) throw new HttpError(404, { error: "not_found", message: "Student not found in this class." });

    if (student.userId) {
      await unlinkStudent(student.id);
      await logEvent(
        "student.unlinked",
        { studentId: student.id, studentName: student.name, previousUserId: student.userId },
        { schoolId: klass.schoolId, classId: klass.id, actorUserId: user.id },
      );
    }
    return Response.json({ ok: true });
  },
);
