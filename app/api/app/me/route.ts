import type { MeResponse, RoleName } from "@/app/app/_lib/types";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/http";

// GET /api/app/me: who am I, which roles, which classes (with linked/total), my roster entry.
export const GET = apiHandler(async (request) => {
  const user = await getRequestUser(request);

  // Classes this user teaches (subject or class teacher), merged per class.
  const classes = new Map<string, MeResponse["classes"][number]>();
  for (const m of user.memberships) {
    if (!m.class || (m.role !== "SUBJECT_TEACHER" && m.role !== "CLASS_TEACHER")) continue;
    const entry = classes.get(m.class.id) ?? {
      id: m.class.id,
      name: m.class.name,
      schoolName: m.school.name,
      subjects: [],
      isClassTeacher: false,
      linked: 0,
      total: 0,
    };
    if (m.role === "SUBJECT_TEACHER" && m.subject) entry.subjects.push(m.subject);
    if (m.role === "CLASS_TEACHER") entry.isClassTeacher = true;
    classes.set(m.class.id, entry);
  }

  const classIds = [...classes.keys()];
  const [totals, linked] = await Promise.all([
    prisma.student.groupBy({ by: ["classId"], where: { classId: { in: classIds } }, _count: { _all: true } }),
    prisma.student.groupBy({ by: ["classId"], where: { classId: { in: classIds }, userId: { not: null } }, _count: { _all: true } }),
  ]);
  for (const row of totals) classes.get(row.classId)!.total = row._count._all;
  for (const row of linked) classes.get(row.classId)!.linked = row._count._all;

  const roles = new Set<RoleName>(user.memberships.map((m) => m.role));
  if (user.student) roles.add("STUDENT");

  const body: MeResponse = {
    displayName: user.displayName,
    roles: [...roles],
    classes: [...classes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    coordinatorOf: user.memberships
      .filter((m) => m.role === "COORDINATOR")
      .map((m) => ({ schoolId: m.schoolId, schoolName: m.school.name })),
    student: user.student
      ? {
          id: user.student.id,
          name: user.student.name,
          rollNo: user.student.rollNo,
          className: user.student.class.name,
          schoolName: user.student.school.name,
        }
      : undefined,
  };
  return Response.json(body);
});
