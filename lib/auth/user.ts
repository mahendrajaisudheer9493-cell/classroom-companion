import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// One shape for "the current user" in both the bot and the Mini App API:
// the User plus their memberships and their linked roster entry (if any).
export const appUserInclude = {
  memberships: { include: { class: true, school: true } },
  student: { include: { class: true, school: true } },
} satisfies Prisma.UserInclude;

export type AppUser = Prisma.UserGetPayload<{ include: typeof appUserInclude }>;

export function loadAppUserByTelegramId(telegramId: bigint): Promise<AppUser | null> {
  return prisma.user.findUnique({ where: { telegramId }, include: appUserInclude });
}

export function loadAppUserById(id: string): Promise<AppUser | null> {
  return prisma.user.findUnique({ where: { id }, include: appUserInclude });
}

/** A user who has neither a linked student nor any membership hasn't joined anything yet. */
export function isLinked(user: Pick<AppUser, "memberships" | "student">): boolean {
  return user.student !== null || user.memberships.length > 0;
}
