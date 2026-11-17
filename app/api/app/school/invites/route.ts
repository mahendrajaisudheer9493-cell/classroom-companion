import { getRequestUser } from "@/lib/auth/request-user";
import { createInvite, createInviteSchema } from "@/lib/domain/school-setup";
import { apiHandler, parseBody } from "@/lib/http";

// POST /api/app/school/invites { schoolId, grants }: one-use teacher invite, valid 7 days.
export const POST = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  return Response.json(await createInvite(user, await parseBody(request, createInviteSchema)));
});
