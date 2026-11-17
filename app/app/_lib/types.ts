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

export type WorkResponse = {
  level: "full" | "status";
  subject: string;
  title: string;
  className: string;
  studentName: string;
  dueLabel: string;
  status: string;
  cancelled: boolean;
  /** true when the student acknowledged the latest version */
  seenLatest: boolean;
  instructions?: string;
  notes?: string | null;
};

export type DoubtThreadResponse = {
  studentName: string;
  className: string;
  assignment: string;
  status: string;
  messages: { id: string; from: "STUDENT" | "TEACHER"; author: string; text: string; at: string }[];
};

export type AssignmentOverviewResponse = {
  assignment: string;
  className: string;
  dueLabel: string;
  status: string;
  counts: Record<string, number>;
  total: number;
};
