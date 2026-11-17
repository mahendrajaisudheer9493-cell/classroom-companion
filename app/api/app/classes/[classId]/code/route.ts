import { loadClassForRoster } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { regenerateJoinCode } from "@/lib/domain/linking";
import { toClassLink } from "@/lib/domain/roster";
import { apiHandler } from "@/lib/http";
import { logEvent } from "@/lib/log";

// POST /api/app/classes/:classId/code: revoke the old class code and create a new one (60 days).
export const POST = apiHandler(async (request, ctx: RouteContext<"/api/app/classes/[classId]/code">) => {
  const user = await getRequestUser(request);
  const { classId } = await ctx.params;
  const klass = await loadClassForRoster(user, classId);

  const code = await regenerateJoinCode(klass.id);
  await logEvent(
    "join_code.regenerated",
    { code: code.code, expiresAt: code.expiresAt },
    { schoolId: klass.schoolId, classId: klass.id, actorUserId: user.id },
  );
  return Response.json({ link: toClassLink(code) });
});
