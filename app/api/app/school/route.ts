import { getRequestUser } from "@/lib/auth/request-user";
import { schoolHealth } from "@/lib/domain/school-health";
import { apiHandler } from "@/lib/http";

// GET /api/app/school[?schoolId=]: school health per class (C2). Coordinator of that school only.
export const GET = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  return Response.json(await schoolHealth(user, schoolId));
});
