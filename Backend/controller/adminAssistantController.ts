import { Request, Response } from "express";
import { runAssistantEvaluation } from "../evaluations/assistantEvaluation.js";
import { AssistantAuditLog } from "../modal/assistantAuditLog.js";
import { AssistantActionAudit } from "../modal/assistantActionAudit.js";
import { analyseAssistantConversations } from "../services/assistantConversationAnalysis.js";

const toConversationRecord = (item: { threadId: string; channel: string; userMessage: string; assistantReply: string; createdAt: Date; latencyMs?: number | null }) => ({
  threadId: item.threadId,
  channel: item.channel as "text" | "voice",
  userMessage: item.userMessage,
  assistantReply: item.assistantReply,
  createdAt: item.createdAt,
  ...(typeof item.latencyMs === "number" ? { latencyMs: item.latencyMs } : {}),
});

const toActionRecord = (item: { threadId: string; action: string; outcome: string; appointmentId?: { toString(): string } | null; createdAt: Date }) => ({
  threadId: item.threadId,
  action: item.action as "book" | "reschedule" | "cancel",
  outcome: item.outcome as "succeeded" | "failed",
  ...(item.appointmentId ? { appointmentId: item.appointmentId.toString() } : {}),
  createdAt: item.createdAt,
});

export const getAssistantEvaluation = (_req: Request, res: Response) => res.json(runAssistantEvaluation());
export const runAssistantEvaluationNow = (_req: Request, res: Response) => res.json(runAssistantEvaluation());

export const listAssistantConversations = async (req: Request, res: Response) => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const conversations = await AssistantAuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
  return res.json({ conversations });
};

export const analyseLiveAssistantConversations = async (_req: Request, res: Response) => {
  const conversations = await AssistantAuditLog.find().sort({ createdAt: -1 }).limit(300).lean();
  const actionAudits = await AssistantActionAudit.find().sort({ createdAt: -1 }).limit(300).lean();
  const findings = analyseAssistantConversations(conversations.map(toConversationRecord), actionAudits.map(toActionRecord));
  return res.json({ analysedConversations: conversations.length, actionAudits, findings, limitation: "Booking, reschedule, and cancellation outcomes are recorded from the actual tool/database layer and correlated with assistant claims. Content heuristics still flag language quality for human review." });
};

// An admin can open one recorded thread and see why it was flagged.  The
// action audit is deliberately returned alongside the transcript because a
// success sentence alone never proves that a calendar/database action worked.
export const getAssistantConversationDetail = async (req: Request, res: Response) => {
  const threadId = String(req.params.threadId ?? "").trim();
  if (!threadId || threadId.length > 160) return res.status(400).json({ message: "A valid conversation thread is required." });

  const [conversations, actionAudits] = await Promise.all([
    AssistantAuditLog.find({ threadId }).sort({ createdAt: 1 }).limit(100).lean(),
    AssistantActionAudit.find({ threadId }).sort({ createdAt: 1 }).limit(100).lean(),
  ]);
  if (!conversations.length) return res.status(404).json({ message: "Conversation not found." });

  const findings = analyseAssistantConversations(conversations.map(toConversationRecord), actionAudits.map(toActionRecord));
  const succeeded = actionAudits.filter((item) => item.outcome === "succeeded");
  const failed = actionAudits.filter((item) => item.outcome === "failed");
  const averageLatency = conversations.reduce((total, item) => total + (item.latencyMs ?? 0), 0) / conversations.length;
  const summary = findings.length
    ? `${findings.length} automated review signal${findings.length === 1 ? "" : "s"} found in this thread. Open each finding below for the evidence and recommended follow-up.`
    : "No automated review signal was found in this thread. This means the configured checks did not detect a known risk; it is not a clinical or quality guarantee.";
  const changesApplied = [...new Set(findings.map((finding) => {
    if (finding.type === "premature_booking_claim") return "Booking guardrail: a booking is held until complete details and explicit confirmation are present; success is only stated after the action tool succeeds.";
    if (finding.type === "confirmation_loop") return "Voice confirmation handling: punctuation is normalized and the latest conversation thread is retained so a spoken confirmation continues the pending booking.";
    if (finding.type === "slow_response") return "Performance path: verified clinic facts and simple availability requests use fast paths; provider/tool timings still need review for this specific slow turn.";
    if (finding.type === "reply_generation_failure") return "Reliability protection: the patient receives a safe recovery message instead of a blank reply, and this failure is now visible to admins for provider/fallback investigation.";
    if (finding.type === "privacy_risk") return "Privacy guardrail: cross-patient record requests are blocked and must be reviewed before any policy change.";
    return "No automated change mapping is available for this finding.";
  }))];

  return res.json({
    threadId,
    conversations,
    actionAudits,
    findings,
    explanation: {
      summary,
      checks: [
        "Confirmation loops and tentative booking language",
        "Booking-success claims compared with actual action audits",
        "Cross-patient privacy-risk wording",
        "Slow responses over 8 seconds",
        "Fallback/recovery replies that indicate assistant generation failed",
      ],
      outcome: succeeded.length
        ? `${succeeded.length} completed action${succeeded.length === 1 ? "" : "s"} recorded in the appointment tool/database.`
        : failed.length
          ? `${failed.length} action failure${failed.length === 1 ? "" : "s"} recorded; no succeeded action is present in this thread.`
          : "No appointment action was requested or recorded for this thread.",
      averageLatencyMs: Math.round(averageLatency),
      changesApplied,
      boundary: "Transcript analysis identifies language patterns only. Appointment creation, cancellation, and rescheduling are verified from the separate tool/database audit shown here.",
    },
  });
};
