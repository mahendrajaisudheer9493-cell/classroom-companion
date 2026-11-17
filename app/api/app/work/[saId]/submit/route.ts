import { Api, InputFile } from "grammy";
import { z } from "zod";
import { getRequestUser } from "@/lib/auth/request-user";
import { assignmentLabel } from "@/lib/bot/cards";
import { getEnv } from "@/lib/env";
import { loadOwn, submitWork, type SubmissionInput } from "@/lib/domain/student-actions";
import { HttpError, apiHandler } from "@/lib/http";

export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB

const jsonBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TEXT"), text: z.string().trim().min(1, "Type your answer").max(4000) }),
  z.object({ kind: z.literal("IN_CLASS") }),
]);

// POST /api/app/work/:saId/submit
//   JSON { kind: "TEXT", text } | { kind: "IN_CLASS" }, or multipart with `file` (photo/document, ≤ 4 MB).
// Uploads are sent by the bot to the student's OWN chat to get a Telegram file_id; we never store files.
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/work/[saId]/submit">) => {
  const user = await getRequestUser(request);
  const { saId } = await ctx.params;
  const own = await loadOwn(user, saId);
  if (!own.ok) throw new HttpError(own.reason === "not_yours" ? 403 : 404, { error: own.reason, message: "You can only submit your own work." });

  let input: SubmissionInput;
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, { error: "invalid", message: "Choose a photo or file." });
    if (file.size > MAX_BYTES) throw new HttpError(413, { error: "too_large", message: "That file is over 4 MB. Send it in the chat instead." });
    const chatId = own.sa.student.userId ? user.chatId : null;
    if (!chatId) throw new HttpError(409, { error: "no_chat", message: "Open the bot in Telegram once (/start), then try again." });

    const api = new Api(getEnv().TELEGRAM_BOT_TOKEN);
    const caption = `Your submission for ${assignmentLabel(own.sa.assignment)}`;
    const upload = new InputFile(new Uint8Array(await file.arrayBuffer()), file.name || "submission");
    const isPhoto = /^image\/(jpeg|png|webp)$/.test(file.type);
    const sent = isPhoto
      ? await api.sendPhoto(Number(chatId), upload, { caption })
      : await api.sendDocument(Number(chatId), upload, { caption });
    const photo = "photo" in sent ? sent.photo[sent.photo.length - 1] : undefined;
    const doc = "document" in sent ? sent.document : undefined;
    const ref = photo ?? doc;
    if (!ref) throw new HttpError(502, { error: "upload_failed", message: "Telegram didn't accept the file. Try again." });
    input = {
      kind: photo ? "PHOTO" : "FILE",
      text: (form.get("caption") as string | null)?.trim() || null,
      file: { fileId: ref.file_id, fileUniqueId: ref.file_unique_id, fileName: doc?.file_name ?? file.name ?? null, mimeType: photo ? "image/jpeg" : (doc?.mime_type ?? file.type ?? null) },
    };
  } else {
    const parsed = jsonBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, { error: "invalid", message: parsed.error.issues[0]?.message ?? "Nothing to submit." });
    input = parsed.data;
  }

  const r = await submitWork(user, saId, input);
  if ("ok" in r) throw new HttpError(404, { error: "not_found", message: "This assignment is closed." });
  if (r.status === "closed") throw new HttpError(409, { error: r.reason, message: r.reason === "cancelled" ? "This assignment was cancelled." : "This work is already completed." });
  if (r.status === "duplicate") return Response.json({ message: `Already received ✓ ${r.label}` });
  return Response.json({ message: input.kind === "IN_CLASS" ? `Submitted ✓ ${r.label} (bringing it to class).` : `Submitted ✓ ${r.label}. Your teacher will review it.` });
});
