import { Api } from "grammy";
import { assertAccess, canViewStudentAssignment } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { HttpError, apiHandler } from "@/lib/http";

export const maxDuration = 30;

// GET /api/files/:submissionId: streams a submitted photo/file from Telegram after an access check
// ("full" only: the student, the subject teacher, the class teacher). The Telegram file URL contains
// the bot token, so it is fetched here and never sent to the browser.
export const GET = apiHandler(async (request, ctx: RouteContext<"/api/files/[submissionId]">) => {
  const user = await getRequestUser(request);
  const { submissionId } = await ctx.params;
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { studentAssignment: { include: { assignment: true } } },
  });
  if (!submission?.telegramFileId) throw new HttpError(404, { error: "not_found", message: "File not found." });
  const { studentAssignment: sa } = submission;
  assertAccess(canViewStudentAssignment(user, { studentId: sa.studentId, assignment: sa.assignment }) === "full", "You can't open this file.", {
    schoolId: sa.assignment.schoolId,
    classId: sa.assignment.classId,
    actorUserId: user.id,
  });

  const token = getEnv().TELEGRAM_BOT_TOKEN;
  const file = await new Api(token).getFile(submission.telegramFileId);
  if (!file.file_path) throw new HttpError(404, { error: "not_found", message: "Telegram no longer has this file." });
  const upstream = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!upstream.ok || !upstream.body) throw new HttpError(502, { error: "upstream", message: "Couldn't fetch the file from Telegram." });

  const name = submission.fileName ?? `submission-${submission.id}${submission.kind === "PHOTO" ? ".jpg" : ""}`;
  return new Response(upstream.body, {
    headers: {
      "Content-Type": submission.mimeType ?? upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
