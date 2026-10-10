import { HumanMessage } from "@langchain/core/messages";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { runWithAgentContext } from "../lib/requestContext.js";
import type { AgentContext } from "../lib/tenantContext.js";
import { getBearerToken, verifyAgentToken } from "../lib/tenantContext.js";
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

export const invokeAssistant = async (
  message: string,
  threadId: string,
  options?: { voiceFastPath?: boolean; voiceLanguage?: string; agentContext?: AgentContext }
) => {
  const invoke = async () => doctorAssistant.invoke({
    messages: [new HumanMessage(message)],
  }, {
    configurable: {
      thread_id: threadId,
      ...(options?.voiceFastPath ? { voiceFastPath: true } : {}),
      ...(options?.voiceLanguage ? { voiceLanguage: options.voiceLanguage } : {}),
    },
  });
  const result = options?.agentContext
    ? await runWithAgentContext(options.agentContext, invoke)
    : await invoke();
  const finalMessage = result.messages[result.messages.length - 1];
  return getMessageText(finalMessage?.content);
};

type VoiceTurnInput = {
  audio: Buffer;
  mimeType: string;
  languageCode?: string | undefined;
  threadId?: string | undefined;
};

export const processVoiceTurn = async ({ audio, mimeType, languageCode, threadId }: VoiceTurnInput) => {
  const safeThreadId = typeof threadId === "string" && VALID_THREAD_ID.test(threadId.trim())
    ? threadId.trim()
    : randomUUID();
  // Let the provider identify the language unless the client deliberately
  // supplies one of Sarvam's supported language codes.
  const requestedLanguage = getLanguageCode(languageCode) ?? "unknown";
  const transcription = await transcribeAudio({
    buffer: audio,
    size: audio.length,
    mimetype: mimeType,
    originalname: "voice-message.webm",
  } as Express.Multer.File, { languageCode: requestedLanguage });
  const reply = await invokeAssistant(transcription.transcript, safeThreadId);
  const speech = await synthesizeSpeech(reply, getTtsLanguageCode(transcription.languageCode ?? requestedLanguage));
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
    const token = getBearerToken(req.get("authorization"));
    agentContext = token ? verifyAgentToken(token) : undefined;
  } catch {
    return res.status(401).json({ message: "Invalid or expired doctor agent token" });
  }
  const threadId = agentContext?.threadId ?? getThreadId(req);

  if (!message) {
    return res.status(400).json({ message: "A chat message is required" });
  }

  try {
    const reply = await invokeAssistant(
      message,
      threadId,
      agentContext ? { agentContext } : undefined
    );
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

export const voiceUpload = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: "An audio file is required in the 'audio' field." });

  try {
    const result = await processVoiceTurn({
      audio: req.file.buffer,
      mimeType: req.file.mimetype,
      languageCode: typeof req.body.languageCode === "string" ? req.body.languageCode : undefined,
      threadId: typeof req.body.threadId === "string" ? req.body.threadId : undefined,
    });
    setThreadCookie(res, result.threadId);
    return res.status(200).json(result);
  } catch (error) {
    const status = getErrorStatus(error) ?? (error as { statusCode?: number }).statusCode ?? 500;
    console.error("Voice upload failed:", formatError(error));
    return res.status(status).json({ message: error instanceof Error ? error.message : "Unable to process voice." });
  }
};
