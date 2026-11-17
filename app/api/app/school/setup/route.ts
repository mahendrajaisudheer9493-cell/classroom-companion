import { getRequestUser } from "@/lib/auth/request-user";
import { setupView } from "@/lib/domain/school-setup";
import { apiHandler } from "@/lib/http";

// GET /api/app/school/setup[?schoolId=]: classes, teachers and open invites (C1). Coordinator only.
export const GET = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  return Response.json(await setupView(user, new URL(request.url).searchParams.get("schoolId")));
});
