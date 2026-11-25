import { describe, expect, it } from "vitest";
import { mentionsClass, mentionsSubject, resolveTarget, verifyTargetHints } from "@/lib/domain/assignment-draft";

// The model may only set subject/class when the teacher wrote them; code checks against the text.
const BUG = "do assignment 4.5 1-8 workbook questions by tomorrow along with diagrams";

describe("verifyTargetHints: never trust a guessed subject or class", () => {
  it("drops a subject the message doesn't name (the bug: 'diagrams' → Maths)", () => {
    expect(verifyTargetHints(BUG, { subject: "Maths", classNames: [] })).toEqual({ subject: null, classNames: [] });
    expect(verifyTargetHints(BUG, { subject: "Science", classNames: [] }).subject).toBeNull();
  });

  it("keeps a subject the teacher wrote, including common aliases", () => {
    expect(verifyTargetHints(`maths ${BUG}`, { subject: "Maths", classNames: [] }).subject).toBe("Maths");
    expect(mentionsSubject("Math worksheet 3 by friday", "Maths")).toBe(true);
    expect(mentionsSubject("mathematics revision", "Maths")).toBe(true);
    expect(mentionsSubject("sci lab report", "Science")).toBe(true);
    expect(mentionsSubject("Eng essay due monday", "English")).toBe(true);
    expect(mentionsSubject("hindi poem", "Hindi")).toBe(true);
    expect(mentionsSubject("Social Studies map work", "Social Studies")).toBe(true);
    expect(mentionsSubject("sst chapter 4", "Social Studies")).toBe(true);
    expect(mentionsSubject("Art: draw a tree", "Art")).toBe(true); // unknown subject: its own name
  });

  it("subject words must be whole words", () => {
    expect(mentionsSubject("the aftermath of the storm essay", "Maths")).toBe(false);
    expect(mentionsSubject("scientific method notes", "Science")).toBe(false);
    expect(mentionsSubject("english.", "English")).toBe(true);
  });

  it("keeps only class names the message contains: 8A, 8 A, 8a, 8-A", () => {
    expect(mentionsClass("8A maths ex 4", "8A")).toBe(true);
    expect(mentionsClass("for 8 a tomorrow", "8A")).toBe(true);
    expect(mentionsClass("8a and 8b", "8B")).toBe(true);
    expect(mentionsClass("class 8-A", "8A")).toBe(true);
    expect(mentionsClass("exercise 8.4 due", "8A")).toBe(false);
    expect(mentionsClass("18A is not 8A? only 18A here", "18A")).toBe(true);
    expect(mentionsClass("only 18A here", "8A")).toBe(false);
    expect(verifyTargetHints("8a and 8b maths revise", { subject: "Maths", classNames: ["8A", "8B", "8C"] })).toEqual({
      subject: "Maths",
      classNames: ["8A", "8B"],
    });
  });

  it("a two-subject teacher with no subject written is asked, with only the subjects they teach", () => {
    const slots = [
      { classId: "a", className: "8A", subject: "Maths" },
      { classId: "b", className: "8B", subject: "Maths" },
      { classId: "a", className: "8A", subject: "Science" },
    ];
    const hints = verifyTargetHints(BUG, { subject: "Maths", classNames: [] });
    expect(resolveTarget(hints, slots)).toEqual({ kind: "ask_subject", options: ["Maths", "Science"] });
    // After choosing Science, only the classes where they teach Science.
    expect(resolveTarget({ subject: "Science", classNames: [] }, slots)).toEqual({ kind: "ok", subject: "Science", classes: [{ id: "a", name: "8A" }] });
  });
});
