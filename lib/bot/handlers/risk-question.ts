import type { BotContext } from "@/lib/bot/context";
import { openAppKeyboard } from "@/lib/bot/keyboards";
import { teachingSlots } from "@/lib/domain/assignments";
import { riskFactsForAsker } from "@/lib/domain/risk";
import { answerRisk } from "@/lib/llm/answer-risk";
import { logEvent } from "@/lib/log";

// "who is at risk this week?" in chat. Code finds the facts for whoever asks (own subjects /
// whole class for a class teacher / whole school for a coordinator); the model only words them.

/** The best screen to continue on: triage for a subject teacher, else the class or school view. */
function followUpButton(user: BotContext["appUser"]) {
  if (teachingSlots(user).length > 0) return openAppKeyboard("Open triage", "/app/triage");
  const coordinator = user.memberships.find((m) => m.role === "COORDINATOR");
  if (coordinator) return openAppKeyboard("Open school health", `/app/school?schoolId=${coordinator.schoolId}`);
  const classTeacher = user.memberships.find((m) => m.role === "CLASS_TEACHER" && m.classId);
  return openAppKeyboard("Open class", classTeacher ? `/app/classes/${classTeacher.classId}` : "/app");
}

export async function handleRiskQuestion(ctx: BotContext, question: string) {
  const user = ctx.appUser;
  const logContext = { schoolId: user.memberships[0]?.schoolId, actorUserId: user.id };
  const facts = await riskFactsForAsker(user);
  const answer = await answerRisk(question, facts.students, { rosterNames: facts.rosterNames, logContext });
  await logEvent(
    "risk.asked",
    { students: facts.students.length, wording: answer.wording, roles: [...new Set(user.memberships.map((m) => m.role))] },
    logContext,
  );
  return ctx.reply(answer.text, { reply_markup: followUpButton(user) });
}
