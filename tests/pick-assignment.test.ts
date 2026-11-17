import { describe, expect, it } from "vitest";
import type { StudentAssignmentStatus } from "@prisma/client";
import { pickAssignment } from "@/lib/domain/pick-assignment";

// "Which homework?" polish: rank not-yet-handed-in work first; if exactly one is still to do, pick it.
const sa = (id: string, status: StudentAssignmentStatus) => ({ id, status });

describe("pickAssignment", () => {
  const maths = sa("maths", "SUBMITTED");
  const science = sa("science", "ACKNOWLEDGED");
  const english = sa("english", "SUBMITTED");

  it("'done' with one homework still to hand in → picks it without asking", () => {
    for (const intent of ["done_will_send", "done_in_class", "submission_text", "progress", "done_menu", "submit_file"]) {
      expect(pickAssignment(intent, [maths, science, english], null).chosen).toBe(science);
    }
  });

  it("NEEDS_REVISION counts as still to hand in", () => {
    expect(pickAssignment("done_will_send", [maths, sa("redo", "NEEDS_REVISION")], null).chosen?.id).toBe("redo");
  });

  it("the model's valid choice wins; an id that isn't a candidate is ignored", () => {
    expect(pickAssignment("done_will_send", [maths, science], "maths").chosen).toBe(maths);
    expect(pickAssignment("done_will_send", [maths, science], "someone-elses").chosen).toBe(science);
  });

  it("two still to do → ask, with those listed first", () => {
    const history = sa("history", "IN_PROGRESS");
    const r = pickAssignment("done_will_send", [maths, science, english, history], null);
    expect(r.chosen).toBeNull();
    expect(r.ranked.map((x) => x.id)).toEqual(["science", "history", "maths", "english"]);
  });

  it("not a work intent (e.g. a question) → no auto-pick, order unchanged", () => {
    const r = pickAssignment("question_about_details", [maths, science], null);
    expect(r.chosen).toBeNull();
    expect(r.ranked).toEqual([maths, science]);
  });

  it("only one open homework → that one, whatever the intent", () => {
    expect(pickAssignment("blocked", [maths], null).chosen).toBe(maths);
  });
});
