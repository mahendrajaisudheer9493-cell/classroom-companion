import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// PendingAction = server-side state for a question or confirmation in chat. Buttons only carry its
// id (callback_data ≤ 64 bytes). Consuming is atomic, so a double tap acts once.

export async function createPending<T extends object>(userId: string, kind: string, payload: T, ttlMinutes = 120) {
  return prisma.pendingAction.create({
    data: {
      userId,
      kind,
      payload: payload as unknown as Prisma.InputJsonObject,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });
}

/** Marks the action used and returns it, or null if it's unknown, someone else's, expired or already used. */
export async function consumePending<T>(id: string, userId: string): Promise<{ kind: string; payload: T } | null> {
  const used = await prisma.pendingAction.updateMany({
    where: { id, userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (used.count === 0) return null;
  const action = await prisma.pendingAction.findUniqueOrThrow({ where: { id } });
  return { kind: action.kind, payload: action.payload as unknown as T };
}

/** The user's latest open action of these kinds (e.g. a question waiting for a typed answer). */
export async function findOpenPending<T>(userId: string, kinds: string[]) {
  const action = await prisma.pendingAction.findFirst({
    where: { userId, kind: { in: kinds }, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return action ? { id: action.id, kind: action.kind, payload: action.payload as unknown as T } : null;
}

/** Closes open actions of these kinds (a new request replaces an unanswered question). */
export async function closeOpenPending(userId: string, kinds: string[]) {
  await prisma.pendingAction.updateMany({
    where: { userId, kind: { in: kinds }, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}
