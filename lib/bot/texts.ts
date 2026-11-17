import type { Role } from "@prisma/client";

// User-facing bot copy, kept in one place.
export const T = {
  askTeacher: "Hi! Ask your teacher for your class link to join.",
  codeUnknown: "That code doesn't match any class. Check with your teacher.",
  codeExpired: "This class link has expired. Ask your teacher for a new one.",
  alreadyLinked: (name: string, className: string) => `You're already linked as ${name} (${className}).`,
  confirmJoin: (className: string, schoolName: string) => `You're joining ${className}, ${schoolName}. Correct?`,
  joinCancelled: "OK, nothing was linked. If this isn't your class, ask your teacher for the right link.",
  whoAreYou: "Who are you?",
  everyoneLinked: "Everyone in this class is already linked. Ask your teacher.",
  nameTaken: "This name is already linked. Ask your teacher.",
  linked: (name: string, className: string) => `You're linked as ${name}, ${className}. Your homework will arrive here.`,
  welcomeStudent: (name: string) => `Welcome back, ${name}! Your homework arrives here.`,
  welcomeStaff: (name: string) => `Welcome, ${name}! Open the app to see your classes and share class links.`,
  inviteUnknown: "That invite link isn't valid. Ask your coordinator for a new one.",
  inviteUsed: "This invite has already been used. Ask your coordinator for a new one.",
  inviteExpired: "This invite has expired. Ask your coordinator for a new one.",
  inviteInvalid: "This invite is set up incorrectly. Ask your coordinator to create a new one.",
  inviteAccepted: (schoolName: string, roles: string[]) =>
    `Welcome to ${schoolName}! You now have:\n${roles.map((r) => `• ${r}`).join("\n")}`,
  notYet: "I can't read messages yet. Use the buttons on your messages, or open the app.",
  help: "I help your class with homework.\nStudents: join with the class link from your teacher; your homework arrives here.\nTeachers: open the app to see your classes and share class links.",
  error: "Something went wrong, please try again.",
  buttonExpired: "This button has expired.",
};

export function roleLabel(g: { role: Role; className: string | null; subject: string | null }, schoolName: string) {
  if (g.role === "SUBJECT_TEACHER") return `${g.subject ?? "Subject"} teacher, ${g.className}`;
  if (g.role === "CLASS_TEACHER") return `Class teacher, ${g.className}`;
  return `Coordinator, ${schoolName}`;
}
