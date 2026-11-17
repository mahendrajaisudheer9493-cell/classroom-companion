import { assignmentLabel } from "@/lib/bot/cards";
import { prisma } from "@/lib/db";
import { transition } from "@/lib/domain/state-machine";
import { logEvent } from "@/lib/log";

export type AckResult =
  | { status: "ok"; changed: boolean; label: string }
  | { status: "cancelled"; label: string }
  | { status: "not_yours" }
  | { status: "not_found" };

/**
 * [Got it]: ASSIGNED → ACKNOWLEDGED (other states keep their status), ackedVersion = current version.
 * A double tap changes nothing. Only the student who owns the StudentAssignment may acknowledge.
 */
export async function acknowledge(user: { id: string; student: { id: string } | null }, saId: string): Promise<AckResult> {
  const sa = await prisma.studentAssignment.findUnique({ where: { id: saId }, include: { assignment: true } });
  if (!sa) return { status: "not_found" };
  const { assignment } = sa;
  if (user.student?.id !== sa.studentId) {
    await logEvent(
      "access.denied",
      { reason: "ack_not_owner", studentAssignmentId: saId },
      { schoolId: assignment.schoolId, classId: assignment.classId, actorUserId: user.id },
    );
    return { status: "not_yours" };
  }
  const label = assignmentLabel(assignment);
  if (assignment.status !== "PUBLISHED") return { status: "cancelled", label };

  const next = transition(sa, "ACKNOWLEDGE", "student");
  if (next === sa.status && sa.ackedVersion === assignment.version) return { status: "ok", changed: false, label };

  // Conditional on what we read, so two simultaneous taps apply (and log) once.
  const updated = await prisma.studentAssignment.updateMany({
    where: { id: sa.id, status: sa.status, ackedVersion: sa.ackedVersion },
    data: { status: next, ackedVersion: assignment.version, lastStudentActivityAt: new Date() },
  });
  if (updated.count === 0) return { status: "ok", changed: false, label };

  await logEvent(
    "assignment.acknowledged",
    { from: sa.status, to: next, version: assignment.version },
    { schoolId: assignment.schoolId, classId: assignment.classId, assignmentId: assignment.id, studentAssignmentId: sa.id, actorUserId: user.id },
  );
  return { status: "ok", changed: true, label };
}
