import { Request, Response } from "express";
import { runAssistantEvaluation } from "../evaluations/assistantEvaluation.js";
import { AssistantAuditLog } from "../modal/assistantAuditLog.js";
import { AssistantActionAudit } from "../modal/assistantActionAudit.js";
import { analyseAssistantConversations } from "../services/assistantConversationAnalysis.js";

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
  const findings = analyseAssistantConversations(conversations.map((item) => ({
    threadId: item.threadId,
    channel: item.channel as "text" | "voice",
    userMessage: item.userMessage,
    assistantReply: item.assistantReply,
    createdAt: item.createdAt,
    ...(typeof item.latencyMs === "number" ? { latencyMs: item.latencyMs } : {}),
  })), actionAudits.map((item) => ({
    threadId: item.threadId,
    action: item.action as "book" | "reschedule" | "cancel",
    outcome: item.outcome as "succeeded" | "failed",
    ...(item.appointmentId ? { appointmentId: item.appointmentId.toString() } : {}),
    createdAt: item.createdAt,
  })));
  return res.json({ analysedConversations: conversations.length, actionAudits, findings, limitation: "Booking, reschedule, and cancellation outcomes are recorded from the actual tool/database layer and correlated with assistant claims. Content heuristics still flag language quality for human review." });
};
