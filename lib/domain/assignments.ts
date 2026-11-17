import type { Assignment } from "@prisma/client";
import { assertAccess, canManageClassSubject, type AccessUser } from "@/lib/access/policy";
import { assignmentCard, cancelledCard, updatedCard } from "@/lib/bot/cards";
import { prisma } from "@/lib/db";
import type { TeachingSlot } from "@/lib/domain/assignment-draft";
import { logEvent } from "@/lib/log";
import { deliveryTime, dropPendingForAssignment, enqueue, sendDue } from "@/lib/queue/outbound";
import { formatIst, nowIst } from "@/lib/time";

// Assignment lifecycle: DRAFT → PUBLISHED → CANCELLED, plus changes (version += 1).
// Every action re-checks access; every notification goes through the outbound queue.

type Actor = AccessUser & { id: string };

/** The (class, subject) pairs this user teaches, from SUBJECT_TEACHER memberships. */
export function teachingSlots(user: {
  memberships: { role: string; classId: string | null; subject: string | null; class: { name: string } | null }[];
}): TeachingSlot[] {
  return user.memberships.flatMap((m) =>
    m.role === "SUBJECT_TEACHER" && m.classId && m.subject && m.class
      ? [{ classId: m.classId, className: m.class.name, subject: m.subject }]
      : [],
  );
}

function assertCanManage(user: Actor, a: Pick<Assignment, "classId" | "subject" | "schoolId">) {
  assertAccess(canManageClassSubject(user, a.classId, a.subject), "You can only manage assignments for your own classes and subjects.", {
    schoolId: a.schoolId,
    classId: a.classId,
    actorUserId: user.id,
  });
}

// ───────────────────────────── Drafts ─────────────────────────────

export type DraftFields = {
  subject: string;
  classId: string;
  title: string;
  instructions: string;
  notes: string | null;
  dueAt: Date;
  sourceText: string | null;
};

export async function createDraft(user: Actor, fields: DraftFields) {
  const klass = await prisma.class.findUniqueOrThrow({ where: { id: fields.classId } });
  assertCanManage(user, { classId: klass.id, subject: fields.subject, schoolId: klass.schoolId });
  const title = fields.title.trim() || fields.instructions.trim().slice(0, 60);
  return prisma.assignment.create({
    data: {
      schoolId: klass.schoolId,
      classId: klass.id,
      subject: fields.subject,
      createdByUserId: user.id,
      title,
      instructions: fields.instructions.trim() || title,
      notes: fields.notes?.trim() || null,
      dueAt: fields.dueAt,
      sourceText: fields.sourceText,
      status: "DRAFT",
    },
    include: { class: true },
  });
}

/** App form: updates an existing DRAFT (from "Edit in app") or creates a new one. */
export async function saveDraft(user: Actor, draftId: string | null, fields: DraftFields) {
  if (!draftId) return createDraft(user, fields);
  const existing = await prisma.assignment.findUnique({ where: { id: draftId } });
  if (!existing || existing.status !== "DRAFT") return null;
  assertCanManage(user, existing);
  const klass = await prisma.class.findUniqueOrThrow({ where: { id: fields.classId } });
  assertCanManage(user, { classId: klass.id, subject: fields.subject, schoolId: klass.schoolId });
  return prisma.assignment.update({
    where: { id: existing.id },
    data: {
      schoolId: klass.schoolId,
      classId: klass.id,
      subject: fields.subject,
      title: fields.title.trim(),
      instructions: fields.instructions.trim() || fields.title.trim(),
      notes: fields.notes?.trim() || null,
      dueAt: fields.dueAt,
    },
    include: { class: true },
  });
}

/** Deletes a draft (preview [Cancel]). Already published → refused. */
export async function deleteDraft(user: Actor, assignmentId: string): Promise<"deleted" | "not_draft"> {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!a || a.status !== "DRAFT") return "not_draft";
  assertCanManage(user, a);
  const deleted = await prisma.assignment.deleteMany({ where: { id: a.id, status: "DRAFT" } });
  return deleted.count ? "deleted" : "not_draft";
}

// ───────────────────────────── Publish ─────────────────────────────

export type PublishResult =
  | { status: "published"; assignment: Assignment; className: string; total: number; onTelegram: number; deliverAt: Date }
  | { status: "already_sent" }
  | { status: "not_found" };

/**
 * [Send] / app submit. Idempotent: only a DRAFT can be published (conditional update), so a double
 * tap or a Telegram retry publishes once. Creates a StudentAssignment for every student in the class
 * and queues the card for linked students; unlinked students get it when they link.
 */
export async function publishAssignment(user: Actor, assignmentId: string): Promise<PublishResult> {
  const draft = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: { class: true } });
  if (!draft || draft.status === "CANCELLED") return { status: "not_found" };
  if (draft.status === "PUBLISHED") return { status: "already_sent" };
  assertCanManage(user, draft);

  const published = await prisma.$transaction(async (tx) => {
    const updated = await tx.assignment.updateMany({
      where: { id: draft.id, status: "DRAFT" },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    if (updated.count === 0) return null; // lost the race to another tap
    const students = await tx.student.findMany({ where: { classId: draft.classId } });
    await tx.studentAssignment.createMany({
      data: students.map((s) => ({ assignmentId: draft.id, studentId: s.id })),
      skipDuplicates: true,
    });
    return students.length;
  });
  if (published === null) return { status: "already_sent" };

  const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id: draft.id } });
  const sas = await prisma.studentAssignment.findMany({
    where: { assignmentId: assignment.id },
    include: { student: { include: { user: true } } },
  });
  let onTelegram = 0;
  for (const sa of sas) {
    const chatId = sa.student.user?.chatId;
    if (!chatId) continue;
    onTelegram++;
    await enqueue({
      chatId,
      recipientUserId: sa.student.userId,
      toStudent: true,
      kind: "assignment.new",
      payload: assignmentCard(assignment, sa.id),
      dedupeKey: `new:${sa.id}:v${assignment.version}`,
    });
  }

  await logEvent(
    "assignment.created",
    { title: assignment.title, subject: assignment.subject, dueAt: assignment.dueAt, students: published, onTelegram },
    { schoolId: assignment.schoolId, classId: assignment.classId, assignmentId: assignment.id, actorUserId: user.id },
  );
  await sendDue();
  return {
    status: "published",
    assignment,
    className: draft.class.name,
    total: published,
    onTelegram,
    deliverAt: deliveryTime(true),
  };
}

export function publishSummary(r: Extract<PublishResult, { status: "published" }>): string {
  const waiting = r.total - r.onTelegram;
  let text = `Sent to ${r.total} students in ${r.className} (${r.onTelegram} on Telegram now; ${waiting} will get it when they join).`;
  if (r.deliverAt > new Date()) text += `\nQuiet hours: students get it at ${formatIst(r.deliverAt)}.`;
  return text;
}

// ─────────────────────── Delivery to newly linked students ───────────────────────

/** Queues cards for this student's published assignments that were never delivered. Idempotent. */
export async function deliverPendingAssignments(studentId: string): Promise<{ queued: number }> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { user: true } });
  const chatId = student?.user?.chatId;
  if (!student || !chatId) return { queued: 0 };

  const sas = await prisma.studentAssignment.findMany({
    where: { studentId, deliveredAt: null, assignment: { status: "PUBLISHED" } },
    include: { assignment: true },
  });
  let queued = 0;
  for (const sa of sas) {
    const r = await enqueue({
      chatId,
      recipientUserId: student.userId,
      toStudent: true,
      kind: "assignment.new",
      payload: assignmentCard(sa.assignment, sa.id),
      dedupeKey: `new:${sa.id}:v${sa.assignment.version}`,
    });
    if (r.queued) queued++;
  }
  if (queued) await sendDue();
  return { queued };
}

// ───────────────────────────── Change and cancel ─────────────────────────────

/** Change/cancel candidates: the teacher's PUBLISHED assignments from the last 30 days. */
export async function recentManagedAssignments(user: Actor & Parameters<typeof teachingSlots>[0]) {
  const slots = teachingSlots(user);
  if (slots.length === 0) return [];
  return prisma.assignment.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { gte: nowIst().minus({ days: 30 }).toJSDate() },
      OR: slots.map((s) => ({ classId: s.classId, subject: s.subject })),
    },
    include: { class: true },
    orderBy: { publishedAt: "desc" },
    take: 15,
  });
}

export type ChangeRequest = { assignmentId: string; expectedVersion: number; dueAt: string | null; instructions: string | null };

export type ChangeResult =
  | { status: "changed"; assignment: Assignment; notified: number; resent: number }
  | { status: "conflict" }
  | { status: "not_found" };

/**
 * Applies a confirmed change: version += 1, statuses stay (students must re-acknowledge).
 * Students who already got the card get "Updated: …"; students who never got it get the new card.
 */
export async function applyChange(user: Actor, req: ChangeRequest): Promise<ChangeResult> {
  const before = await prisma.assignment.findUnique({ where: { id: req.assignmentId } });
  if (!before || before.status !== "PUBLISHED") return { status: "not_found" };
  assertCanManage(user, before);

  const updated = await prisma.assignment.updateMany({
    where: { id: before.id, status: "PUBLISHED", version: req.expectedVersion },
    data: {
      ...(req.dueAt ? { dueAt: new Date(req.dueAt) } : {}),
      ...(req.instructions ? { instructions: req.instructions } : {}),
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) return { status: "conflict" };
  const after = await prisma.assignment.findUniqueOrThrow({ where: { id: before.id } });

  // Cards for the old version that haven't gone out yet are replaced by the new version.
  await dropPendingForAssignment(after.id, ["assignment.new"]);
  const sas = await prisma.studentAssignment.findMany({
    where: { assignmentId: after.id },
    include: { student: { include: { user: true } } },
  });
  const dueChanged = after.dueAt.getTime() !== before.dueAt.getTime();
  let notified = 0;
  let resent = 0;
  for (const sa of sas) {
    const chatId = sa.student.user?.chatId;
    if (!chatId) continue;
    if (sa.deliveredAt) {
      await enqueue({
        chatId,
        recipientUserId: sa.student.userId,
        toStudent: true,
        kind: "assignment.updated",
        payload: updatedCard(after, sa.id, {
          oldDueAt: dueChanged ? before.dueAt : null,
          instructionsChanged: after.instructions !== before.instructions,
        }),
        dedupeKey: `upd:${sa.id}:v${after.version}`,
      });
      notified++;
    } else {
      await enqueue({
        chatId,
        recipientUserId: sa.student.userId,
        toStudent: true,
        kind: "assignment.new",
        payload: assignmentCard(after, sa.id),
        dedupeKey: `new:${sa.id}:v${after.version}`,
      });
      resent++;
    }
  }

  await logEvent(
    "assignment.updated",
    { version: after.version, oldDueAt: before.dueAt, newDueAt: after.dueAt, instructionsChanged: after.instructions !== before.instructions, notified },
    { schoolId: after.schoolId, classId: after.classId, assignmentId: after.id, actorUserId: user.id },
  );
  await sendDue();
  return { status: "changed", assignment: after, notified, resent };
}

/** Cancels: status CANCELLED, drops unsent cards/updates/reminders, tells students who had it. */
export async function applyCancel(user: Actor, assignmentId: string): Promise<{ status: "cancelled"; notified: number } | { status: "not_found" }> {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!a || a.status !== "PUBLISHED") return { status: "not_found" };
  assertCanManage(user, a);

  const updated = await prisma.assignment.updateMany({
    where: { id: a.id, status: "PUBLISHED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (updated.count === 0) return { status: "not_found" };

  const dropped = await dropPendingForAssignment(a.id, ["assignment.new", "assignment.updated", "reminder"]);
  const sas = await prisma.studentAssignment.findMany({
    where: { assignmentId: a.id, deliveredAt: { not: null } },
    include: { student: { include: { user: true } } },
  });
  let notified = 0;
  for (const sa of sas) {
    const chatId = sa.student.user?.chatId;
    if (!chatId) continue;
    await enqueue({
      chatId,
      recipientUserId: sa.student.userId,
      toStudent: true,
      kind: "assignment.cancelled",
      payload: cancelledCard(a, sa.id),
      dedupeKey: `cxl:${sa.id}`,
    });
    notified++;
  }

  await logEvent(
    "assignment.cancelled",
    { title: a.title, notified, droppedPending: dropped },
    { schoolId: a.schoolId, classId: a.classId, assignmentId: a.id, actorUserId: user.id },
  );
  await sendDue();
  return { status: "cancelled", notified };
}
