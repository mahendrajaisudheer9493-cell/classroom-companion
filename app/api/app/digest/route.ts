import { assertAccess } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { teachingSlots } from "@/lib/domain/assignments";
import { sendDigestNow } from "@/lib/domain/digest";
import { apiHandler } from "@/lib/http";

// POST /api/app/digest: [Send my digest now] (demo). Same counts and text as the 07:30 digest.
export const POST = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  assertAccess(teachingSlots(user).length > 0, "Only subject teachers get a digest.", { actorUserId: user.id });
  const r = await sendDigestNow(user);
  const message = r.sent
    ? "Digest sent to your Telegram chat."
    : "Nothing to report: every count is zero, so the morning digest would be skipped today.";
  return Response.json({ sent: r.sent, counts: r.counts, message });
});
