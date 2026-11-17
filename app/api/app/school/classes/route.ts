import { getRequestUser } from "@/lib/auth/request-user";
import { createClass, createClassSchema } from "@/lib/domain/school-setup";
import { apiHandler, parseBody } from "@/lib/http";

// POST /api/app/school/classes { schoolId, name, grade, roster }: new class + roster + class code.
export const POST = apiHandler(async (request) => {
  const user = await getRequestUser(request);
  const input = await parseBody(request, createClassSchema);
  const r = await createClass(user, input);
  return Response.json({ ...r, message: `Class ${input.name} created with ${r.students} student${r.students === 1 ? "" : "s"}.` });
});
