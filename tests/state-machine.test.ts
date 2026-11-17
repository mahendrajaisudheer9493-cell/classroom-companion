import type { StudentAssignmentStatus as Status } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { IllegalTransition, transition, type Actor, type StudentEvent } from "@/lib/domain/state-machine";

const go = (status: Status, event: StudentEvent, actor: Actor) => transition({ status }, event, actor);

describe("state machine: allowed transitions (DESIGN.md §4)", () => {
  const allowed: [Status, StudentEvent, Actor, Status][] = [
    ["ASSIGNED", "ACKNOWLEDGE", "student", "ACKNOWLEDGED"],
    // progress
    ["ASSIGNED", "REPORT_PROGRESS", "student", "IN_PROGRESS"],
    ["ACKNOWLEDGED", "REPORT_PROGRESS", "student", "IN_PROGRESS"],
    ["BLOCKED", "REPORT_PROGRESS", "student", "IN_PROGRESS"],
    // stuck
    ["ASSIGNED", "REPORT_STUCK", "student", "BLOCKED"],
    ["ACKNOWLEDGED", "REPORT_STUCK", "student", "BLOCKED"],
    ["IN_PROGRESS", "REPORT_STUCK", "student", "BLOCKED"],
    ["NEEDS_REVISION", "REPORT_STUCK", "student", "BLOCKED"],
    // teacher resolves a doubt
    ["BLOCKED", "RESOLVE_DOUBT", "teacher", "IN_PROGRESS"],
    // any open state → SUBMITTED (incl. resubmission after revision)
    ["ASSIGNED", "SUBMIT", "student", "SUBMITTED"],
    ["ACKNOWLEDGED", "SUBMIT", "student", "SUBMITTED"],
    ["IN_PROGRESS", "SUBMIT", "student", "SUBMITTED"],
    ["BLOCKED", "SUBMIT", "student", "SUBMITTED"],
    ["NEEDS_REVISION", "SUBMIT", "student", "SUBMITTED"],
    // feedback
    ["SUBMITTED", "FEEDBACK_REVISION", "teacher", "NEEDS_REVISION"],
    ["SUBMITTED", "FEEDBACK_COMPLETE", "teacher", "COMPLETED"],
    // checked in class, from every open state
    ["ASSIGNED", "CHECKED_IN_CLASS", "teacher", "COMPLETED"],
    ["ACKNOWLEDGED", "CHECKED_IN_CLASS", "teacher", "COMPLETED"],
    ["IN_PROGRESS", "CHECKED_IN_CLASS", "teacher", "COMPLETED"],
    ["BLOCKED", "CHECKED_IN_CLASS", "teacher", "COMPLETED"],
    ["SUBMITTED", "CHECKED_IN_CLASS", "teacher", "COMPLETED"],
    ["NEEDS_REVISION", "CHECKED_IN_CLASS", "teacher", "COMPLETED"],
  ];
  it.each(allowed)("%s --%s (%s)--> %s", (from, event, actor, to) => {
    expect(go(from, event, actor)).toBe(to);
  });
});

describe("state machine: no-ops", () => {
  it.each<[Status, StudentEvent, Actor]>([
    ["ACKNOWLEDGED", "ACKNOWLEDGE", "student"], // double tap
    ["IN_PROGRESS", "ACKNOWLEDGE", "student"], // re-ack after a change keeps status
    ["BLOCKED", "ACKNOWLEDGE", "student"],
    ["SUBMITTED", "ACKNOWLEDGE", "student"],
    ["COMPLETED", "ACKNOWLEDGE", "student"],
    ["BLOCKED", "REPORT_STUCK", "student"],
    ["IN_PROGRESS", "REPORT_PROGRESS", "student"],
    ["SUBMITTED", "SUBMIT", "student"], // resubmission: latest counts, status stays
    ["COMPLETED", "CHECKED_IN_CLASS", "teacher"],
  ])("%s --%s--> stays %s", (from, event, actor) => {
    expect(go(from, event, actor)).toBe(from);
  });
});

describe("state machine: illegal transitions throw", () => {
  it.each<[Status, StudentEvent, Actor]>([
    ["COMPLETED", "SUBMIT", "student"],
    ["COMPLETED", "REPORT_STUCK", "student"],
    ["ASSIGNED", "FEEDBACK_COMPLETE", "teacher"], // nothing submitted yet
    ["IN_PROGRESS", "FEEDBACK_REVISION", "teacher"],
    ["IN_PROGRESS", "RESOLVE_DOUBT", "teacher"], // not blocked
    ["SUBMITTED", "REPORT_PROGRESS", "student"],
    ["SUBMITTED", "FEEDBACK_COMPLETE", "student"], // wrong actor
    ["BLOCKED", "SUBMIT", "teacher"], // wrong actor
    ["ASSIGNED", "ACKNOWLEDGE", "teacher"], // wrong actor
  ])("%s --%s (%s)--> throws", (from, event, actor) => {
    expect(() => go(from, event, actor)).toThrow(IllegalTransition);
  });
});
