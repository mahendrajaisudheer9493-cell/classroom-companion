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
