import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { AppUser } from "@/lib/auth/user";
import { assertAccess, canManageRoster } from "@/lib/access/policy";

export * from "@/lib/access/policy";

// Thin helpers: load the record, then decide with the pure policy functions.

/** Loads a class the user may manage the roster of, or throws 404 / AccessDenied (→ 403). */
export async function loadClassForRoster(user: AppUser, classId: string) {
  const klass = await prisma.class.findUnique({ where: { id: classId }, include: { school: true } });
  if (!klass) throw new HttpError(404, { error: "not_found", message: "Class not found." });
  assertAccess(canManageRoster(user, klass.id), "You can only manage the rosters of your own classes.", {
    schoolId: klass.schoolId,
    classId: klass.id,
    actorUserId: user.id,
  });
  return klass;
}
