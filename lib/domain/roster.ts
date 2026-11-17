import type { ClassLink, RosterResponse } from "@/app/app/_lib/types";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { activeJoinCode, listRoster } from "@/lib/domain/linking";

export function classLinkUrl(code: string): string {
  return `https://t.me/${getEnv().TELEGRAM_BOT_USERNAME}?start=c_${code}`;
}

export function toClassLink(code: { code: string; expiresAt: Date }): ClassLink {
  return { code: code.code, url: classLinkUrl(code.code), expiresAt: code.expiresAt.toISOString() };
}

/** Roster view for a class. Callers must have checked canManageRoster first. */
export async function getRoster(
  klass: { id: string; name: string; school: { name: string } },
  viewer: { isClassTeacher: boolean } = { isClassTeacher: false },
): Promise<RosterResponse> {
  const [students, code] = await Promise.all([listRoster(klass.id), activeJoinCode(klass.id)]);
  const users = await prisma.user.findMany({
    where: { id: { in: students.flatMap((s) => (s.userId ? [s.userId] : [])) } },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    class: { id: klass.id, name: klass.name, schoolName: klass.school.name },
    link: code ? toClassLink(code) : null,
    students: students.map((s) => {
      const u = s.userId ? userById.get(s.userId) : undefined;
      return {
        id: s.id,
        name: s.name,
        rollNo: s.rollNo,
        linked: s.userId !== null,
        linkedAt: s.linkedAt?.toISOString() ?? null,
        linkedAs: u ? `${u.displayName}${u.telegramUsername ? ` (@${u.telegramUsername})` : ""}` : null,
      };
    }),
    linked: students.filter((s) => s.userId).length,
    total: students.length,
    isClassTeacher: viewer.isClassTeacher,
  };
}
