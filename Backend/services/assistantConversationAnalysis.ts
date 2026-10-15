export type ConversationAuditRecord = {
  threadId: string;
  channel: "text" | "voice";
  userMessage: string;
  assistantReply: string;
  createdAt: Date;
  latencyMs?: number;
};

export type LiveConversationFinding = {
  threadId: string;
  severity: "warning" | "review";
  type: "premature_booking_claim" | "confirmation_loop" | "privacy_risk" | "slow_response" | "reply_generation_failure";
  evidence: string;
  recommendation: string;
  createdAt: Date;
};
export type ActionAuditRecord = { threadId: string; action: "book" | "reschedule" | "cancel"; outcome: "succeeded" | "failed"; appointmentId?: string | null; createdAt: Date };

const confirmation = (value: string) => /^(yes|yes,? confirm|confirm|haan|ha|ji haan)[.!?।\s]*$/i.test(value.trim());
const bookingClaim = (value: string) => /\b(appointment|booking)\b.{0,45}\b(booked|confirmed|set)\b|\b(booked|confirmed)\b.{0,45}\bappointment\b/i.test(value);
const asksConfirmation = (value: string) => /\b(yes,? confirm|confirm (?:the|this|your)|reply exactly)\b/i.test(value);
const privacyRisk = (value: string) => /\b(all patient records|other patients?|patient records)\b/i.test(value) && !/can(?:not|'t)|cannot|unable|won't|will not/i.test(value);
const recoveryReply = (value: string) => /(?:couldn't|could not) prepare a reply|unable to get an assistant response|couldn't reach the assistant/i.test(value);

// Heuristics intentionally analyse only stored conversation content; they do
// not pretend that text proves tool/database state. The admin UI states that
// limitation alongside these findings.
export const analyseAssistantConversations = (records: ConversationAuditRecord[], actions: ActionAuditRecord[] = []): LiveConversationFinding[] => {
  const findings: LiveConversationFinding[] = [];
  const byThread = new Map<string, ConversationAuditRecord[]>();
  for (const record of records) byThread.set(record.threadId, [...(byThread.get(record.threadId) ?? []), record]);

  for (const [threadId, turns] of byThread) {
    const ordered = [...turns].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let index = 0; index < ordered.length; index += 1) {
      const turn = ordered[index];
      if (!turn) continue;
      const priorUserTurns = ordered.slice(0, index + 1).map((item) => item.userMessage);
      const hasConfirmed = priorUserTurns.some(confirmation);
      if (bookingClaim(turn.assistantReply)) {
        if (!hasConfirmed) findings.push({
          threadId, severity: "warning", type: "premature_booking_claim", createdAt: turn.createdAt,
          evidence: `Assistant said: “${turn.assistantReply.slice(0, 180)}” before an explicit confirmation appears in the recorded thread.`,
          recommendation: "Review the tool trace and enforce explicit confirmation before any booking-success response.",
        });
        const successfulBooking = actions.some((action) => action.threadId === threadId && action.action === "book" && action.outcome === "succeeded" && action.createdAt <= turn.createdAt);
        if (!successfulBooking) findings.push({
          threadId, severity: "warning", type: "premature_booking_claim", createdAt: turn.createdAt,
          evidence: `Assistant claimed booking success but this thread has no successful booking tool/database audit before the reply.`,
          recommendation: "Investigate immediately; never claim booking success without a succeeded action audit and appointment ID.",
        });
      }
      if (privacyRisk(turn.assistantReply)) findings.push({
        threadId, severity: "warning", type: "privacy_risk", createdAt: turn.createdAt,
        evidence: `Potential patient-data disclosure: “${turn.assistantReply.slice(0, 180)}”`,
        recommendation: "Review immediately; patient records must never be disclosed across users.",
      });
      if (recoveryReply(turn.assistantReply)) findings.push({
        threadId, severity: "warning", type: "reply_generation_failure", createdAt: turn.createdAt,
        evidence: `The assistant returned its recovery message instead of an answer: “${turn.assistantReply.slice(0, 180)}”`,
        recommendation: "Review provider/API error logs and configured fallback model for this turn. The patient should retry only after the service is healthy.",
      });
      if ((turn.latencyMs ?? 0) > 8_000) findings.push({
        threadId, severity: "review", type: "slow_response", createdAt: turn.createdAt,
        evidence: `Response took ${(turn.latencyMs! / 1000).toFixed(1)} seconds (${turn.channel}).`,
        recommendation: "Check model/provider and tool timings for this request.",
      });
      const previous = ordered[index - 1];
      if (previous && confirmation(turn.userMessage) && asksConfirmation(turn.assistantReply) && asksConfirmation(previous.assistantReply)) findings.push({
        threadId, severity: "review", type: "confirmation_loop", createdAt: turn.createdAt,
        evidence: `Patient confirmed “${turn.userMessage}”, but the assistant asked for confirmation again.`,
        recommendation: "Check pending booking state and confirmation normalization for this thread.",
      });
    }
  }
  return findings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};
