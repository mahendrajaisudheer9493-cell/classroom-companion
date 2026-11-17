// JSON shapes of the Mini App API, shared by the route handlers and the pages.

export type RoleName = "SUBJECT_TEACHER" | "CLASS_TEACHER" | "COORDINATOR" | "STUDENT";

export type MeResponse = {
  displayName: string;
  roles: RoleName[];
  /** Classes whose roster this user manages (subject or class teacher). */
  classes: {
    id: string;
    name: string;
    schoolName: string;
    subjects: string[];
    isClassTeacher: boolean;
    linked: number;
    total: number;
  }[];
  coordinatorOf: { schoolId: string; schoolName: string }[];
  student?: { id: string; name: string; rollNo: string; className: string; schoolName: string };
};

export type ClassLink = { code: string; url: string; expiresAt: string };

export type RosterResponse = {
  class: { id: string; name: string; schoolName: string };
  link: ClassLink | null;
  students: {
    id: string;
    name: string;
    rollNo: string;
    linked: boolean;
    linkedAt: string | null;
    /** The Telegram account that claimed this name, so a teacher can spot a wrong claim. */
    linkedAs: string | null;
  }[];
  linked: number;
  total: number;
};

export type FormOption = { classId: string; className: string; subject: string };

export type AssignmentFormResponse = {
  options: FormOption[];
  draft?: {
    id: string;
    classId: string;
    subject: string;
    title: string;
    instructions: string;
    notes: string | null;
    dueDate: string; // YYYY-MM-DD (IST)
    dueTime: string; // HH:mm (IST)
  };
};

export type CreateAssignmentBody = {
  draftId?: string;
  classId: string;
  subject: string;
  title: string;
  instructions: string;
  notes?: string;
  dueDate: string;
  dueTime: string;
};

export type CreateAssignmentResponse = { assignmentId: string; message: string };

export type TriageFlagName = "hasnt_seen_change" | "not_on_telegram" | "unanswered_question" | "overdue";

export type TriageItemDto = {
  saId: string;
  assignmentId: string;
  studentName: string;
  className: string;
  assignment: string;
  status: string;
  dueLabel: string;
  flags: TriageFlagName[];
  lastActivityAt: string | null;
  since: string | null;
};

export type TriageResponse = {
  classes: { id: string; name: string }[];
  counts: { stuck: number; silent: number; overdue: number; toReview: number };
  stuck: TriageItemDto[];
  silent: TriageItemDto[];
  overdue: TriageItemDto[];
  toReview: TriageItemDto[];
};

export type AssignmentDetailResponse = {
  id: string;
  subject: string;
  title: string;
  className: string;
  instructions: string;
  notes: string | null;
  dueLabel: string;
  dueDate: string; // YYYY-MM-DD IST
  dueTime: string; // HH:mm IST
  version: number;
  status: string;
  canManage: boolean;
  /** coordinator: names + statuses only */
  statusOnly: boolean;
  counts: Record<string, number>;
  students: {
    saId: string;
    name: string;
    rollNo: string;
    status: string;
    flags: TriageFlagName[];
    hasSubmission: boolean;
    /** latest reminder fired for this student (full viewers only) */
    lastReminder: { kind: string; at: string } | null;
  }[];
};

export type TickResponse =
  | {
      ok: true;
      ms: number;
      reminders: { silent: number; due_soon: number; blocked_checkin: number; overdue: number; skippedBlocked: number };
      digests: number;
      queue: { sent: number; failed: number; dead: number; deferred: number };
      /** plain words, e.g. "Sent: 1 'did you see it?' to Anu · …" */
      message: string;
    }
  | { skipped: true };

export type NudgeResponse = { nudged: number; alreadyToday: number; notOnTelegram: number; skipped: number; deliverAt: string | null; message: string };

export type DoubtThreadDto = {
  studentName: string;
  className: string;
  assignment: string;
  assignmentId: string;
  status: string;
  /** subject teacher */
  canReply: boolean;
  canResolve: boolean;
  /** the student who owns it */
  isOwner: boolean;
  messages: {
    id: string;
    from: "STUDENT" | "TEACHER";
    author: string;
    text: string;
    at: string;
    /** teacher replies waiting for quiet hours to end */
    deliverAt: string | null;
  }[];
};

export type SubmissionDto = {
  id: string;
  kind: "TEXT" | "PHOTO" | "FILE" | "IN_CLASS";
  text: string | null;
  fileName: string | null;
  mimeType: string | null;
  at: string;
};

export type FeedbackDto = { id: string; result: "COMPLETED" | "NEEDS_REVISION"; comment: string; teacher: string; at: string };

export type ReviewResponse = {
  saId: string;
  studentName: string;
  className: string;
  assignment: string;
  assignmentId: string;
  dueLabel: string;
  status: string;
  canReview: boolean;
  submissions: SubmissionDto[];
  feedback: FeedbackDto[];
};

export type MyWorkItem = {
  saId: string;
  subject: string;
  title: string;
  dueLabel: string;
  status: string;
  updated: boolean; // a change the student hasn't acknowledged
};

export type MyWorkResponse = {
  overdue: MyWorkItem[];
  today: MyWorkItem[];
  week: MyWorkItem[];
  later: MyWorkItem[];
  done: MyWorkItem[];
};

export type WorkDetailResponse = {
  level: "full" | "status";
  isOwner: boolean;
  saId: string;
  subject: string;
  title: string;
  className: string;
  studentName: string;
  dueLabel: string;
  status: string;
  cancelled: boolean;
  instructions?: string;
  notes?: string | null;
  /** "Updated: due moved from Thu 19 to Mon 23", when the student hasn't acknowledged the change */
  changeNote: string | null;
  canAct: boolean;
  canSubmit: boolean;
  submissions: SubmissionDto[];
  feedback: FeedbackDto[];
  doubtCount: number;
};
