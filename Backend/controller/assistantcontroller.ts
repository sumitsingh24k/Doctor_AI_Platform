import { HumanMessage } from "@langchain/core/messages";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getAgentContext, runWithAgentContext } from "../lib/requestContext.js";
import type { AgentContext } from "../lib/tenantContext.js";
import { getBearerToken, verifyAgentToken } from "../lib/tenantContext.js";
import { verifyAccessToken } from "../lib/auth.js";
import { formatSpokenResponse } from "../lib/spokenFormatting.js";
import User from "../modal/userschema.js";
import { Doctor } from "../modal/doctordetails.js";
import { AssistantAuditLog } from "../modal/assistantAuditLog.js";
import { doctorAssistant } from "../agent/doctorAssistantAgent.js";
import {
  transcribeAudio,
  synthesizeSpeech,
  isSpeechToTextLanguage,
  type SpeechToTextLanguage,
  type TextToSpeechLanguage,
} from "../voiceservices/sarvamconnect.js";

const THREAD_COOKIE = "doctor_assistant_thread_id";
const VALID_THREAD_ID = /^[A-Za-z0-9_-]{1,128}$/;

const getMessageText = (content: unknown) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String(part.text)
          : ""
      )
      .join("");
  }
  return "";
};

const getCookie = (req: Request, name: string) => {
  const cookieHeader = req.get("cookie");
  if (!cookieHeader) return undefined;

  const value = cookieHeader
    .split(";")
    .map((entry) => entry.trim().split("=", 2))
    .find(([key]) => key === name)?.[1];

  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const getThreadId = (req: Request) => {
  const candidates = [req.body.threadId, req.get("x-thread-id"), getCookie(req, THREAD_COOKIE)];
  const suppliedThreadId = candidates.find(
    (value): value is string => typeof value === "string" && VALID_THREAD_ID.test(value.trim())
  );
  return suppliedThreadId?.trim() ?? randomUUID();
};

const getErrorStatus = (error: unknown) => {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { status?: unknown; response?: { status?: unknown } };
  return typeof value.status === "number"
    ? value.status
    : typeof value.response?.status === "number"
      ? value.response.status
      : undefined;
};

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    const providerError = error as Error & { statusText?: unknown; errorDetails?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: getErrorStatus(error),
      statusText: providerError.statusText,
      providerDetails: providerError.errorDetails,
    };
  }
  return { value: error, status: getErrorStatus(error) };
};

// Analytics must never delay or fail a patient-facing assistant reply.
const recordAssistantConversation = (input: {
  threadId: string;
  doctorId?: string;
  channel: "text" | "voice";
  userMessage: string;
  assistantReply: string;
  latencyMs?: number;
}) => {
  const record = {
    ...input,
    threadId: input.threadId.trim().slice(0, 128),
    userMessage: input.userMessage.trim().slice(0, 5_000),
    assistantReply: input.assistantReply.trim().slice(0, 10_000),
    ...(typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs)
      ? { latencyMs: Math.max(0, Math.round(input.latencyMs)) }
      : {}),
  };
  // Required conversation content must be present before writing to MongoDB.
  // This keeps an unexpected provider empty-output from producing noisy
  // validation errors or corrupting the admin evaluation data.
  if (!record.threadId || !record.userMessage || !record.assistantReply) {
    console.warn("assistant.audit_log.skipped", { reason: "missing_conversation_content" });
    return;
  }
  void AssistantAuditLog.create(record).catch((error: unknown) => {
    const validation = error as { errors?: Record<string, { message?: string }> };
    console.warn("assistant.audit_log.failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      fields: validation.errors ? Object.keys(validation.errors) : undefined,
    });
  });
};

export const invokeAssistant = async (
  message: string,
  threadId: string,
  options?: { voiceFastPath?: boolean; voiceLanguage?: string; agentContext?: AgentContext; signal?: AbortSignal }
) => {
  const invoke = async () => doctorAssistant.invoke({
    messages: [new HumanMessage(message)],
  }, {
    configurable: {
      thread_id: options?.agentContext ? `${options.agentContext.doctorId}:${threadId}` : threadId,
      ...(options?.voiceFastPath ? { voiceFastPath: true } : {}),
      ...(options?.voiceLanguage ? { voiceLanguage: options.voiceLanguage } : {}),
    },
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  const result = options?.agentContext
    ? await runWithAgentContext(options.agentContext, invoke)
    : await invoke();
  const finalMessage = result.messages[result.messages.length - 1];
  const reply = formatSpokenResponse(getMessageText(finalMessage?.content)).trim();
  // Do not return an empty 200 response: the UI otherwise renders a blank
  // assistant bubble and the audit schema correctly rejects it. A short
  // recovery message is safer than pretending a tool action succeeded.
  return reply || "I couldn't prepare a reply just now. Please repeat your request.";
};

const resolveRequestAgentContext = async (req: Request): Promise<AgentContext | undefined> => {
  const token = getBearerToken(req.get("authorization"));
  const requestedDoctorId = typeof req.body?.doctorId === "string" ? req.body.doctorId.trim() : "";
  if (token) {
    try {
      const context = verifyAgentToken(token);
      if (requestedDoctorId && requestedDoctorId !== context.doctorId) {
        throw Object.assign(new Error("This assistant token is for a different clinic"), { statusCode: 403 });
      }
      return context;
    } catch (agentError) {
      if ((agentError as { statusCode?: number })?.statusCode === 403) throw agentError;
      const user = verifyAccessToken(token);
      if (user.role === "doctor") {
        const account = await User.findById(user.userId).select("doctorId");
        const doctorId = account?.doctorId?.toString();
        if (!doctorId) throw Object.assign(new Error("Complete your doctor profile before using the assistant"), { statusCode: 403 });
        if (requestedDoctorId && requestedDoctorId !== doctorId) {
          throw Object.assign(new Error("You can only use the assistant for your own clinic"), { statusCode: 403 });
        }
        return { doctorId, threadId: getThreadId(req), expiresAt: user.expiresAt };
      }
    }
  }

  let doctorId = requestedDoctorId || getAgentContext()?.doctorId;
  if (!doctorId) {
    const clinics = await Doctor.find({ setupComplete: true, googleRefreshToken: { $type: "string", $ne: "" } }).select("_id").limit(2).lean();
    if (clinics.length === 1) doctorId = String(clinics[0]?._id);
    else if (clinics.length > 1) throw Object.assign(new Error("Select a clinic before using the assistant"), { statusCode: 400 });
    else throw Object.assign(new Error("No clinics are ready for online bookings yet"), { statusCode: 404 });
  }
  if (!/^[a-f\d]{24}$/i.test(doctorId)) {
    throw Object.assign(new Error("A valid doctorId is required"), { statusCode: 400 });
  }
  if (!(await Doctor.exists({ _id: doctorId, setupComplete: true, googleRefreshToken: { $type: "string", $ne: "" } }))) {
    throw Object.assign(new Error("This clinic is not ready for public assistant bookings"), { statusCode: 404 });
  }
  return { doctorId, threadId: getThreadId(req), expiresAt: Math.floor(Date.now() / 1000) + 3600 };
};

type VoiceTurnInput = {
  audio: Buffer;
  mimeType: string;
  languageCode?: string | undefined;
  threadId?: string | undefined;
  agentContext?: AgentContext | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: (event: Record<string, unknown>) => void;
};

export const processVoiceTurn = async ({ audio, mimeType, languageCode, threadId, agentContext, signal, onProgress }: VoiceTurnInput) => {
  const startedAt = Date.now();
  const throwIfCancelled = () => {
    if (signal?.aborted) throw new DOMException("The voice turn was interrupted", "AbortError");
  };
  throwIfCancelled();
  const safeThreadId = typeof threadId === "string" && VALID_THREAD_ID.test(threadId.trim())
    ? threadId.trim()
    : randomUUID();
  // Let the provider identify the language unless the client deliberately
  // supplies one of Sarvam's supported language codes.
  const requestedLanguage = getLanguageCode(languageCode) ?? "unknown";
  const normalizedMimeType = mimeType.split(";", 1)[0]?.trim().toLowerCase() || "audio/webm";
  const audioExtension = normalizedMimeType === "audio/wav" || normalizedMimeType === "audio/x-wav" ? "wav" : normalizedMimeType === "audio/mp4" ? "mp4" : normalizedMimeType === "audio/ogg" ? "ogg" : "webm";
  const transcription = await transcribeAudio({
    buffer: audio,
    size: audio.length,
    mimetype: normalizedMimeType,
    originalname: `voice-message.${audioExtension}`,
  } as Express.Multer.File, { languageCode: requestedLanguage, ...(signal ? { signal } : {}) });
  throwIfCancelled();
  onProgress?.({ type: "transcript", transcript: transcription.transcript, languageCode: transcription.languageCode });
  const detectedLanguage = transcription.languageCode ?? requestedLanguage;
  const reply = await invokeAssistant(transcription.transcript, safeThreadId, {
    ...(agentContext ? { agentContext } : {}),
    ...(detectedLanguage !== "unknown" ? { voiceLanguage: detectedLanguage } : {}),
    ...(signal ? { signal } : {}),
  });
  recordAssistantConversation({
    threadId: safeThreadId,
    ...(agentContext?.doctorId ? { doctorId: agentContext.doctorId } : {}),
    channel: "voice",
    userMessage: transcription.transcript,
    assistantReply: reply,
    latencyMs: Date.now() - startedAt,
  });
  throwIfCancelled();
  onProgress?.({ type: "assistant_reply", threadId: safeThreadId, reply });
  let speech: Awaited<ReturnType<typeof synthesizeSpeech>>;
  try {
    speech = await synthesizeSpeech(reply, getTtsLanguageCode(detectedLanguage), signal);
    throwIfCancelled();
  } catch (error) {
    throwIfCancelled();
    if (!onProgress) throw error;
    onProgress({ type: "assistant_audio_error", message: "The reply is ready, but voice playback could not be generated." });
    return { threadId: safeThreadId, ...transcription, reply, audioBase64: "", audioContentType: "" };
  }
  onProgress?.({ type: "assistant_audio", audioBase64: speech.audioBase64, audioContentType: speech.contentType });
  return {
    threadId: safeThreadId,
    ...transcription,
    reply,
    audioBase64: speech.audioBase64,
    audioContentType: speech.contentType,
  };
};

const setThreadCookie = (res: Response, threadId: string) => {
  res.setHeader(
    "Set-Cookie",
    `${THREAD_COOKIE}=${encodeURIComponent(threadId)}; Path=/api/assistant; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
};

export const chatWithDoctorAssistant = async (req: Request, res: Response) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  let agentContext;
  try {
    agentContext = await resolveRequestAgentContext(req);
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return res.status(statusCode).json({ message: error instanceof Error ? error.message : "Invalid or expired authentication token" });
  }
  const threadId = agentContext?.threadId ?? getThreadId(req);
  const startedAt = Date.now();

  if (!message) {
    return res.status(400).json({ message: "A chat message is required" });
  }

  try {
    const reply = await invokeAssistant(
      message,
      threadId,
      agentContext ? { agentContext } : undefined
    );
    recordAssistantConversation({
      threadId,
      ...(agentContext?.doctorId ? { doctorId: agentContext.doctorId } : {}),
      channel: "text",
      userMessage: message,
      assistantReply: reply,
      latencyMs: Date.now() - startedAt,
    });
    setThreadCookie(res, threadId);
    return res.status(200).json({
      threadId,
      reply,
    });
  } catch (error) {
    const status = getErrorStatus(error);
    // Log the provider's complete diagnostic server-side, without exposing API details to patients.
    console.error("Doctor assistant failed:", formatError(error));
    if (status === 429) {
      return res.status(429).json({
        threadId,
        message: "The assistant is temporarily busy. Please try again in a moment.",
      });
    }
    return res.status(500).json({ threadId, message: "Unable to get an assistant response" });
  }
};

const getLanguageCode = (value: unknown) =>
  isSpeechToTextLanguage(value) ? value.trim() as SpeechToTextLanguage : undefined;

const TTS_LANGUAGE_CODES = new Set<TextToSpeechLanguage>([
  "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN",
  "od-IN", "pa-IN", "ta-IN", "te-IN",
]);

const getTtsLanguageCode = (value: unknown): TextToSpeechLanguage => {
  if (typeof value === "string" && TTS_LANGUAGE_CODES.has(value as TextToSpeechLanguage)) {
    return value as TextToSpeechLanguage;
  }
  return "en-IN";
};

export const synthesizeVoicePrompt = async (
  kind: "welcome" | "follow_up" | "final_check_in",
  languageCode: string | undefined,
  agentContext: AgentContext | undefined,
  signal?: AbortSignal,
) => {
  if (signal?.aborted) throw new DOMException("The voice prompt was interrupted", "AbortError");
  const clinic = agentContext?.doctorId
    ? await Doctor.findById(agentContext.doctorId).select("assistantName assistantWelcome").lean()
    : null;
  if (!clinic) throw new Error("Clinic context is required to greet the patient");

  const assistantName = clinic.assistantName?.trim() || "clinic assistant";
  const configuredWelcome = clinic.assistantWelcome?.trim().slice(0, 400);
  const isHindi = languageCode === "hi-IN";
  const text = kind === "welcome"
    ? configuredWelcome || (isHindi
      ? `नमस्ते, मैं ${assistantName} हूँ। आज मैं आपकी किस तरह मदद कर सकता हूँ?`
      : `Hello, I'm ${assistantName}. What can I help you with today?`)
    : kind === "follow_up"
      ? isHindi
        ? "कोई जल्दी नहीं। मैं क्लिनिक की जानकारी या अपॉइंटमेंट में मदद के लिए यहीं हूँ।"
        : "Take your time. I'm here if you'd like to ask about the clinic or an appointment."
      : isHindi
        ? "मैं सुन रहा हूँ। जब भी आप तैयार हों, बोल सकते हैं।"
        : "I'm still listening. Speak whenever you're ready.";
  const speech = await synthesizeSpeech(text, getTtsLanguageCode(languageCode), signal);
  return { text, ...speech };
};

export const voiceUpload = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: "An audio file is required in the 'audio' field." });

  try {
    const agentContext = await resolveRequestAgentContext(req);
    const result = await processVoiceTurn({
      audio: req.file.buffer,
      mimeType: req.file.mimetype,
      languageCode: typeof req.body.languageCode === "string" ? req.body.languageCode : undefined,
      threadId: typeof req.body.threadId === "string" ? req.body.threadId : undefined,
      agentContext,
    });
    setThreadCookie(res, result.threadId);
    return res.status(200).json(result);
  } catch (error) {
    const status = getErrorStatus(error) ?? (error as { statusCode?: number }).statusCode ?? 500;
    console.error("Voice upload failed:", formatError(error));
    return res.status(status).json({ message: error instanceof Error ? error.message : "Unable to process voice." });
  }
};
