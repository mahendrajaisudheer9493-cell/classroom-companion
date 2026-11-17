import { assertAccess } from "@/lib/access";
import { getRequestUser } from "@/lib/auth/request-user";
import { teachingSlots } from "@/lib/domain/assignments";
import { atRiskFor } from "@/lib/domain/risk";
import { apiHandler } from "@/lib/http";

// GET /api/app/risk: "Who is at risk this week?" for the teacher's own class+subjects.
export const GET = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  assertAccess(teachingSlots(user).length > 0, "Only subject teachers can see this.", { actorUserId: user.id });
  return Response.json({ students: await atRiskFor(user) });
});
