import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type LogContext = {
  schoolId?: string | null;
  classId?: string | null;
  assignmentId?: string | null;
  studentAssignmentId?: string | null;
  actorUserId?: string | null;
};

// BigInt (Telegram IDs) and Error aren't JSON-serialisable by default.
function replacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}

/**
 * Structured log: ONE JSON line to stdout ({ event, ...context, ...data }) and, when the school is
 * known, an ActivityEvent row. Never throws: logging must not break the request it describes.
 */
export async function logEvent(
  type: string,
  data: Record<string, unknown> = {},
  context: LogContext = {},
): Promise<void> {
  let safeData: Prisma.InputJsonObject = {};
  try {
    safeData = JSON.parse(JSON.stringify(data, replacer));
    console.log(JSON.stringify({ event: type, time: new Date().toISOString(), ...context, ...safeData }));
  } catch {
    console.log(JSON.stringify({ event: type, note: "unserialisable data" }));
  }

  if (!context.schoolId) return;
  try {
    await prisma.activityEvent.create({
      data: {
        type,
        schoolId: context.schoolId,
        classId: context.classId ?? null,
        assignmentId: context.assignmentId ?? null,
        studentAssignmentId: context.studentAssignmentId ?? null,
        actorUserId: context.actorUserId ?? null,
        data: safeData,
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ event: "log.write_failed", type, error: String(err) }));
  }
}
