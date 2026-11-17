import { randomInt } from "node:crypto";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma, isUniqueViolation } from "@/lib/db";
import { nowIst } from "@/lib/time";

// Identity comes from the class roster, never from the Telegram name (DESIGN.md §2).
// Students: class code → confirm class → pick an unclaimed name. Teachers: one-use invite.

export const JOIN_CODE_VALID_DAYS = 60;

// ───────────────────────────── Join codes ─────────────────────────────

const joinCodeInclude = { class: { include: { school: true } } } satisfies Prisma.JoinCodeInclude;
type JoinCodeWithClass = Prisma.JoinCodeGetPayload<{ include: typeof joinCodeInclude }>;

export type JoinCodeLookup =
  | { status: "ok"; joinCode: JoinCodeWithClass }
  | { status: "unknown" }
  | { status: "expired" };

function findJoinCodeById(id: string) {
  return prisma.joinCode.findUnique({ where: { id }, include: joinCodeInclude });
}

function checkJoinCode(joinCode: JoinCodeWithClass | null): JoinCodeLookup {
  if (!joinCode) return { status: "unknown" };
  if (joinCode.revokedAt || joinCode.expiresAt <= new Date()) return { status: "expired" };
  return { status: "ok", joinCode };
}

/** Looks up a class code typed by a student (case-insensitive). */
export async function lookupJoinCode(code: string): Promise<JoinCodeLookup> {
  const joinCode = await prisma.joinCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: joinCodeInclude,
  });
  return checkJoinCode(joinCode);
}

export async function lookupJoinCodeById(id: string): Promise<JoinCodeLookup> {
  return checkJoinCode(await findJoinCodeById(id));
}

/** The class's current usable code, if any. */
export function activeJoinCode(classId: string) {
  return prisma.joinCode.findFirst({
    where: { classId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

// No 0/O or 1/I so codes are easy to read out in class.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 6): string {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Revokes every active code of the class and creates a new random 6-character code (60 days). */
export async function regenerateJoinCode(classId: string) {
  const expiresAt = nowIst().plus({ days: JOIN_CODE_VALID_DAYS }).toJSDate();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.joinCode.updateMany({ where: { classId, revokedAt: null }, data: { revokedAt: new Date() } });
        return tx.joinCode.create({ data: { classId, code: generateCode(), expiresAt } });
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // code collision: try another code
    }
  }
  throw new Error("Could not generate a unique join code");
}

// ───────────────────────────── Students ─────────────────────────────

const byRollNo = (a: { rollNo: string }, b: { rollNo: string }) =>
  a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true });

export async function listUnclaimedStudents(classId: string) {
  const students = await prisma.student.findMany({ where: { classId, userId: null } });
  return students.sort(byRollNo);
}

export async function listRoster(classId: string) {
  const students = await prisma.student.findMany({ where: { classId } });
  return students.sort(byRollNo);
}

export type ClaimResult =
  | { ok: true; student: { id: string; name: string; schoolId: string; classId: string; className: string } }
  | { ok: false; reason: "code_invalid" | "wrong_class" | "name_taken" }
  | { ok: false; reason: "already_linked"; name: string; className: string };

/**
 * Links `userId` to a roster entry. Succeeds only if the code is still valid, the student is in
 * the code's class, the student is unclaimed AND this user has no linked student (pilot: one
 * Telegram account = one student). Safe against double taps and races (conditional update +
 * unique Student.userId).
 */
export async function claimStudent(userId: string, joinCodeId: string, studentId: string): Promise<ClaimResult> {
  const code = await lookupJoinCodeById(joinCodeId);
  if (code.status !== "ok") return { ok: false, reason: "code_invalid" };
  const klass = code.joinCode.class;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.student.findUnique({ where: { userId }, include: { class: true } });
      if (existing) return { ok: false, reason: "already_linked", name: existing.name, className: existing.class.name } as const;

      const student = await tx.student.findUnique({ where: { id: studentId } });
      if (!student || student.classId !== klass.id) return { ok: false, reason: "wrong_class" } as const;

      const claimed = await tx.student.updateMany({
        where: { id: studentId, userId: null },
        data: { userId, linkedAt: new Date() },
      });
      if (claimed.count === 0) return { ok: false, reason: "name_taken" } as const;

      return {
        ok: true,
        student: { id: student.id, name: student.name, schoolId: student.schoolId, classId: klass.id, className: klass.name },
      } as const;
    });
  } catch (err) {
    // Same user claiming two names at once: Student.userId is unique.
    if (isUniqueViolation(err)) {
      const existing = await prisma.student.findUnique({ where: { userId }, include: { class: true } });
      if (existing) return { ok: false, reason: "already_linked", name: existing.name, className: existing.class.name };
    }
    throw err;
  }
}

/** Teacher action: frees a wrongly claimed name so the right student can claim it. */
export async function unlinkStudent(studentId: string) {
  return prisma.student.update({ where: { id: studentId }, data: { userId: null, linkedAt: null } });
}

// ───────────────────────────── Teacher invites ─────────────────────────────

const grantsSchema = z.array(
  z.object({
    classId: z.string().nullable().default(null),
    role: z.enum(Role),
    subject: z.string().nullable().default(null),
  }),
);

export type InviteGrant = { role: Role; className: string | null; subject: string | null };

export type InviteResult =
  | { ok: true; schoolId: string; schoolName: string; grants: InviteGrant[] }
  | { ok: false; reason: "unknown" | "used" | "expired" | "invalid" };

/**
 * One-use, expiring invite: atomically marks it used, then grants its memberships
 * (find-or-create, so an existing role isn't duplicated). All in one transaction.
 */
export async function acceptTeacherInvite(userId: string, rawCode: string): Promise<InviteResult> {
  const code = rawCode.trim().toUpperCase();
  const invite = await prisma.teacherInvite.findUnique({ where: { code }, include: { school: true } });
  if (!invite) return { ok: false, reason: "unknown" };
  if (invite.usedAt) return { ok: false, reason: "used" };
  if (invite.expiresAt <= new Date()) return { ok: false, reason: "expired" };

  const parsed = grantsSchema.safeParse(invite.grants);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const classes = await prisma.class.findMany({
    where: { schoolId: invite.schoolId, id: { in: parsed.data.flatMap((g) => (g.classId ? [g.classId] : [])) } },
  });
  const className = new Map(classes.map((c) => [c.id, c.name]));
  // Every class in the invite must belong to the invite's school.
  if (parsed.data.some((g) => g.classId && !className.has(g.classId))) return { ok: false, reason: "invalid" };

  return prisma.$transaction(async (tx) => {
    const marked = await tx.teacherInvite.updateMany({
      where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date(), usedByUserId: userId },
    });
    if (marked.count === 0) return { ok: false, reason: "used" } as const; // lost a race / double tap

    for (const g of parsed.data) {
      const data = { userId, schoolId: invite.schoolId, classId: g.classId, role: g.role, subject: g.subject };
      const existing = await tx.membership.findFirst({ where: data });
      if (!existing) await tx.membership.create({ data });
    }
    return {
      ok: true,
      schoolId: invite.schoolId,
      schoolName: invite.school.name,
      grants: parsed.data.map((g) => ({
        role: g.role,
        className: g.classId ? (className.get(g.classId) ?? null) : null,
        subject: g.subject,
      })),
    } as const;
  });
}
