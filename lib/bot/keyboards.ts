import { InlineKeyboard } from "grammy";
import { getEnv } from "@/lib/env";

// Telegram callback_data is limited to 64 bytes. Format: "<prefix>:<id>[:<id>]" with cuid ids
// (25 chars), e.g. "pk:<joinCodeId>:<studentId>" = 54 bytes. Anything bigger → PendingAction id.
export const CB = {
  joinYes: "jy", // jy:<joinCodeId>
  joinNo: "jn", // jn
  pick: "pk", // pk:<joinCodeId>:<studentId>
  // student assignment card
  ack: "ack", // ack:<studentAssignmentId>
  stuck: "stk", // stk:<studentAssignmentId>
  done: "don", // don:<studentAssignmentId>
  // student follow-ups (direct, safe to repeat: they check the current status)
  progress: "prg", // prg:<saId>  [Making progress]
  sendNow: "snw", // snw:<saId>  [Send it now]
  typeAnswer: "typ", // typ:<saId>  [I'll type my answer]
  inClass: "inc", // inc:<saId>  [Bringing it to class]
  stillStuck: "sst", // sst:<saId>  [Still stuck] (morning check-in)
  figuredOut: "fig", // fig:<saId>  [Figured it out]
  stuckAgain: "ist", // ist:<saId>  [I'm still stuck] (after "resolved")
  // student follow-ups that carry state (PendingAction, used once)
  studentWhich: "sw", // sw:<pendingId>:<saId>  "Which homework is this about?"
  studentChoose: "si", // si:<pendingId>:<b|p|d>  "I'm not sure what you mean"
  studentYes: "sy", // sy:<pendingId>  [Yes, submit] / [Yes]
  studentNo: "sn", // sn:<pendingId>  [No]
  skip: "skp", // skp:<pendingId>  [Skip] stuck details
  askTeacher: "ask", // ask:<pendingId>  [Ask my teacher]
  fileYes: "fy", // fy:<pendingId>  submit the photo/file
  fileFor: "sf", // sf:<pendingId>:<saId>  photo/file is for this homework
  fileDoubt: "sd", // sd:<pendingId>  [It's a doubt]
  // teacher drafts and confirmations
  send: "snd", // snd:<assignmentId>
  deleteDraft: "dcx", // dcx:<assignmentId>
  answer: "q", // q:<pendingActionId>:<value>
  which: "wh", // wh:<pendingActionId>:<assignmentId>
  confirm: "cfm", // cfm:<pendingActionId>
  abort: "abt", // abt:<pendingActionId>
} as const;

export function callbackData(prefix: string, ...ids: string[]): string {
  const data = [prefix, ...ids].join(":");
  if (Buffer.byteLength(data) > 64) throw new Error(`callback_data over 64 bytes: ${data}`);
  return data;
}

export function appUrl(path = "/app"): string {
  return new URL(path, getEnv().APP_URL).toString();
}

/** A web_app button that opens the Mini App inside Telegram. */
export function openAppKeyboard(label = "Open app", path = "/app") {
  return new InlineKeyboard().webApp(label, appUrl(path));
}

export function confirmJoinKeyboard(joinCodeId: string) {
  return new InlineKeyboard()
    .text("Yes", callbackData(CB.joinYes, joinCodeId))
    .text("No", callbackData(CB.joinNo));
}

export function pickStudentKeyboard(joinCodeId: string, students: { id: string; name: string }[]) {
  const kb = new InlineKeyboard();
  for (const s of students) kb.text(s.name, callbackData(CB.pick, joinCodeId, s.id)).row();
  return kb;
}
