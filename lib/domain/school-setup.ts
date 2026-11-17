import { z } from "zod";
import type { InviteDto, SchoolSetupResponse } from "@/app/app/_lib/types";
import { assertAccess, canManageSchool, type AccessUser } from "@/lib/access";
import { isUniqueViolation, prisma } from "@/lib/db";
import { generateCode, regenerateJoinCode } from "@/lib/domain/linking";
import { toClassLink } from "@/lib/domain/roster";
import { getEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { nowIst } from "@/lib/time";

// Coordinator setup (C1): classes + rosters, teacher invites, class teacher per class, memberships.
// Every function checks canManageSchool for the school the record belongs to (403 + access.denied).

export const INVITE_VALID_DAYS = 7;
type Coordinator = AccessUser & { id: string };

function assertCoordinator(user: Coordinator, schoolId: string, classId?: string) {
  assertAccess(canManageSchool(user, schoolId), "Only this school's coordinator can change its setup.", {
    schoolId,
    classId,
    actorUserId: user.id,
  });
}

const bad = (message: string) => new HttpError(400, { error: "bad_request", message });

export function inviteUrl(code: string): string {
  return `https://t.me/${getEnv().TELEGRAM_BOT_USERNAME}?start=t_${code}`;
}

/** "Maths teacher · 8A", "Class teacher · 8B" */
export function grantLabel(g: { role: string; subject: string | null; className: string | null }): string {
  const role = g.role === "SUBJECT_TEACHER" ? `${g.subject} teacher` : g.role === "CLASS_TEACHER" ? "Class teacher" : "Coordinator";
  return g.className ? `${role} · ${g.className}` : role;
}

// ───────────────────────────── Read ─────────────────────────────

export async function setupView(user: Coordinator, schoolId?: string | null): Promise<SchoolSetupResponse> {
  const id = schoolId ?? user.memberships.find((m) => m.role === "COORDINATOR")?.schoolId ?? "";
  assertCoordinator(user, id);
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) throw new HttpError(404, { error: "not_found", message: "School not found." });

  const [classes, memberships, invites] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: id },
      orderBy: { name: "asc" },
      include: {
        students: { select: { userId: true } },
        joinCodes: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.membership.findMany({ where: { schoolId: id }, include: { user: true, class: true }, orderBy: { createdAt: "asc" } }),
    prisma.teacherInvite.findMany({ where: { schoolId: id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  const className = new Map(classes.map((c) => [c.id, c.name]));

  const teachers = new Map<string, SchoolSetupResponse["teachers"][number]>();
  for (const m of memberships) {
    const t = teachers.get(m.userId) ?? {
      userId: m.userId,
      name: m.user.displayName,
      username: m.user.telegramUsername,
      isYou: m.userId === user.id,
      memberships: [],
    };
    t.memberships.push({
      id: m.id,
      role: m.role,
      classId: m.classId,
      className: m.class?.name ?? null,
      subject: m.subject,
      label: grantLabel({ role: m.role, subject: m.subject, className: m.class?.name ?? null }),
    });
    teachers.set(m.userId, t);
  }

  return {
    school: { id: school.id, name: school.name },
    classes: classes.map((c) => {
      const ct = memberships.find((m) => m.role === "CLASS_TEACHER" && m.classId === c.id);
      return {
        id: c.id,
        name: c.name,
        grade: c.grade,
        total: c.students.length,
        linked: c.students.filter((s) => s.userId).length,
        classTeacher: ct ? { userId: ct.userId, name: ct.user.displayName } : null,
        link: c.joinCodes[0] ? toClassLink(c.joinCodes[0]) : null,
      };
    }),
    teachers: [...teachers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    invites: invites.map((i) => toInviteDto(i, className)),
  };
}

function toInviteDto(i: { code: string; expiresAt: Date; grants: unknown }, className: Map<string, string>): InviteDto {
  const grants = grantsSchema.safeParse(i.grants);
  return {
    code: i.code,
    url: inviteUrl(i.code),
    expiresAt: i.expiresAt.toISOString(),
    grants: grants.success
      ? grants.data.map((g) => grantLabel({ role: g.role, subject: g.subject ?? null, className: g.classId ? (className.get(g.classId) ?? null) : null }))
      : [],
  };
}

// ───────────────────────────── Classes ─────────────────────────────

export const createClassSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1, "Give the class a name, e.g. 8C.").max(20),
  grade: z.coerce.number().int().min(1).max(12),
  roster: z.string().max(10_000).default(""),
});

/** "one name per line" → clean names in order (blank lines dropped). */
export function parseRoster(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+[.)\s-]+/, "").trim()) // tolerate "1. Name" or "1) Name"
    .filter((l) => l.length > 0);
}

/** New class + students (roll numbers 1..n in the pasted order) + a class code. */
export async function createClass(user: Coordinator, input: z.infer<typeof createClassSchema>) {
  assertCoordinator(user, input.schoolId);
  const names = parseRoster(input.roster);
  if (names.length > 100) throw bad("A class can have at most 100 students.");
  if (names.some((n) => n.length > 80)) throw bad("A name is longer than 80 characters. Put one name per line.");

  let klass;
  try {
    klass = await prisma.$transaction(async (tx) => {
      const c = await tx.class.create({ data: { schoolId: input.schoolId, name: input.name, grade: input.grade } });
      if (names.length) {
        await tx.student.createMany({
          data: names.map((name, i) => ({ schoolId: input.schoolId, classId: c.id, name, rollNo: String(i + 1) })),
        });
      }
      return c;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, { error: "conflict", message: `There is already a class called ${input.name}.` });
    throw err;
  }
  const code = await regenerateJoinCode(klass.id);
  await logEvent("class.created", { name: klass.name, students: names.length }, { schoolId: input.schoolId, classId: klass.id, actorUserId: user.id });
  return { classId: klass.id, students: names.length, link: toClassLink(code) };
}

// ───────────────────────────── Teachers ─────────────────────────────

/** Removes one membership of a teacher in this school. A coordinator can't remove their own coordinator role. */
export async function removeMembership(user: Coordinator, membershipId: string) {
  const m = await prisma.membership.findUnique({ where: { id: membershipId } });
  if (!m) throw new HttpError(404, { error: "not_found", message: "That role no longer exists." });
  assertCoordinator(user, m.schoolId, m.classId ?? undefined);
  if (m.userId === user.id && m.role === "COORDINATOR") throw bad("You can't remove your own coordinator role.");
  await prisma.membership.delete({ where: { id: m.id } });
  await logEvent("membership.removed", { userId: m.userId, role: m.role, subject: m.subject }, {
    schoolId: m.schoolId,
    classId: m.classId,
    actorUserId: user.id,
  });
}

const grantsSchema = z.array(
  z.object({
    classId: z.string().min(1),
    role: z.enum(["SUBJECT_TEACHER", "CLASS_TEACHER"]),
    subject: z.string().trim().max(40).nullable().optional(),
  }),
);

export const createInviteSchema = z.object({
  schoolId: z.string().min(1),
  grants: grantsSchema.min(1, "Choose at least one class and role.").max(12),
});

/** One-use invite valid 7 days, carrying the chosen memberships. */
export async function createInvite(user: Coordinator, input: z.infer<typeof createInviteSchema>): Promise<InviteDto> {
  assertCoordinator(user, input.schoolId);
  const classes = await prisma.class.findMany({ where: { schoolId: input.schoolId, id: { in: input.grants.map((g) => g.classId) } } });
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const grants = input.grants.map((g) => {
    // A class from another school (or made up): refused and logged like any cross-school request.
    assertAccess(className.has(g.classId), "That class isn't in your school.", {
      schoolId: input.schoolId,
      classId: g.classId,
      actorUserId: user.id,
    });
    const subject = g.role === "SUBJECT_TEACHER" ? g.subject?.trim() : null;
    if (g.role === "SUBJECT_TEACHER" && !subject) throw bad("A subject teacher needs a subject.");
    return { classId: g.classId, role: g.role, subject: subject ?? null };
  });

  const expiresAt = nowIst().plus({ days: INVITE_VALID_DAYS }).toJSDate();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const invite = await prisma.teacherInvite.create({ data: { schoolId: input.schoolId, code: generateCode(8), grants, expiresAt } });
      await logEvent("invite.created", { code: invite.code, grants }, { schoolId: input.schoolId, actorUserId: user.id });
      return toInviteDto(invite, className);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Could not generate a unique invite code");
}

/** At most one class teacher per class: replaces the previous one. The teacher must already be in this school. */
export async function setClassTeacher(user: Coordinator, classId: string, teacherUserId: string) {
  const klass = await prisma.class.findUnique({ where: { id: classId } });
  if (!klass) throw new HttpError(404, { error: "not_found", message: "Class not found." });
  assertCoordinator(user, klass.schoolId, klass.id);
  const inSchool = await prisma.membership.findFirst({ where: { userId: teacherUserId, schoolId: klass.schoolId } });
  if (!inSchool) throw bad("Pick a teacher who is already in this school (send them an invite first).");

  await prisma.$transaction(async (tx) => {
    await tx.membership.deleteMany({ where: { classId, role: "CLASS_TEACHER", userId: { not: teacherUserId } } });
    const existing = await tx.membership.findFirst({ where: { classId, role: "CLASS_TEACHER", userId: teacherUserId } });
    if (!existing) await tx.membership.create({ data: { userId: teacherUserId, schoolId: klass.schoolId, classId, role: "CLASS_TEACHER" } });
  });
  await logEvent("class_teacher.set", { userId: teacherUserId }, { schoolId: klass.schoolId, classId, actorUserId: user.id });
}
