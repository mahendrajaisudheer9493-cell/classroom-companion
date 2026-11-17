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
