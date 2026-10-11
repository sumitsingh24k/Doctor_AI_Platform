import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { processVoiceTurn, synthesizeVoicePrompt } from "../controller/assistantcontroller.js";
import { MAX_AUDIO_BYTES } from "../voiceservices/sarvamconnect.js";
import { verifyAgentToken, type AgentContext } from "./tenantContext.js";
import { Doctor } from "../modal/doctordetails.js";

export const VOICE_SOCKET_PATH = "/ws/assistant/voice";

type ControlMessage =
  | { type: "start"; threadId?: string; languageCode?: string; mimeType?: string; doctorId?: string; agentToken?: string }
  | { type: "speech_start"; turnId: number }
  | { type: "commit"; turnId: number }
  | { type: "prompt"; turnId: number; kind: "welcome" | "follow_up" | "final_check_in" }
  | { type: "reset" };

type VoiceSession = {
  threadId: string | undefined;
  languageCode: string | undefined;
  mimeType: string;
  chunks: Buffer[];
  totalBytes: number;
  processing: boolean;
  recording: boolean;
  turnId: number;
  turnAbort?: AbortController;
  agentContext?: AgentContext;
};

const sendJson = (socket: WebSocket, payload: Record<string, unknown>) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
};

const clearAudio = (session: VoiceSession) => {
  session.chunks = [];
  session.totalBytes = 0;
};

const rawDataToBuffer = (data: WebSocket.RawData) => {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(new Uint8Array(data));
};

const parseControlMessage = (data: WebSocket.RawData): ControlMessage | undefined => {
  try {
    const message: unknown = JSON.parse(rawDataToBuffer(data).toString());
    if (!message || typeof message !== "object" || !("type" in message)) return undefined;
    const type = (message as { type?: unknown }).type;
    return type === "start" || type === "speech_start" || type === "commit" || type === "prompt" || type === "reset" ? message as ControlMessage : undefined;
  } catch {
    return undefined;
  }
};

export const installVoiceWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_AUDIO_BYTES });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== VOICE_SOCKET_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) => wss.emit("connection", websocket, request));
  });

  wss.on("connection", (socket) => {
    const sessionId = randomUUID();
    const session: VoiceSession = { threadId: undefined, languageCode: undefined, mimeType: "audio/webm", chunks: [], totalBytes: 0, processing: false, recording: false, turnId: 0 };
    sendJson(socket, { type: "ready", protocol: "voice.v2", message: "Send start, then speech_start, audio chunks, and commit for each turn." });

    socket.on("message", async (data, isBinary) => {
      if (isBinary) {
        if (!session.recording) return;
        const chunk = rawDataToBuffer(data);
        if (!chunk.length) return;
        if (session.totalBytes + chunk.length > MAX_AUDIO_BYTES) {
          clearAudio(session);
          return sendJson(socket, { type: "error", message: "Audio must be 15 MB or smaller." });
        }
        session.chunks.push(chunk);
        session.totalBytes += chunk.length;
        return;
      }

      const message = parseControlMessage(data);
      if (!message) return sendJson(socket, { type: "error", message: "Invalid voice control message." });
      if (message.type === "reset") {
        if (session.turnAbort) console.info("voice.turn.cancelled", { sessionId, turnId: session.turnId, reason: "session_reset" });
        session.turnAbort?.abort();
        delete session.turnAbort;
        clearAudio(session);
        session.recording = false;
        session.processing = false;
        session.turnId += 1;
        delete session.agentContext;
        session.threadId = undefined;
        return sendJson(socket, { type: "reset" });
      }
      if (message.type === "start") {
        if (session.processing) return sendJson(socket, { type: "error", message: "Wait for the current reply." });
        let agentContext: AgentContext | undefined;
        if (message.agentToken) {
          try {
            agentContext = verifyAgentToken(message.agentToken);
          } catch {
            return sendJson(socket, { type: "error", message: "Invalid or expired clinic assistant token." });
          }
          if (message.doctorId && message.doctorId !== agentContext.doctorId) {
            return sendJson(socket, { type: "error", message: "This assistant token is for a different clinic." });
          }
        } else if (typeof message.doctorId === "string" && /^[a-f\d]{24}$/i.test(message.doctorId)) {
          const doctor = await Doctor.findOne({ _id: message.doctorId, setupComplete: true, googleRefreshToken: { $type: "string", $ne: "" } }).select("_id");
          if (!doctor) return sendJson(socket, { type: "error", message: "Doctor profile not found." });
          agentContext = {
            doctorId: doctor._id.toString(),
            threadId: typeof message.threadId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(message.threadId)
              ? message.threadId
              : randomUUID(),
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          };
        } else {
          const clinics = await Doctor.find({ setupComplete: true, googleRefreshToken: { $type: "string", $ne: "" } }).select("_id").limit(2).lean();
          if (clinics.length !== 1) {
            return sendJson(socket, { type: "error", message: clinics.length ? "Select a clinic before starting the voice assistant." : "No clinics are ready for online bookings yet." });
          }
          const clinic = clinics[0];
          if (!clinic) return sendJson(socket, { type: "error", message: "No clinic profiles are available yet." });
          agentContext = {
            doctorId: String(clinic._id),
            threadId: typeof message.threadId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(message.threadId)
              ? message.threadId
              : randomUUID(),
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          };
        }
        if (!agentContext) return sendJson(socket, { type: "error", message: "Unable to select a clinic for this voice session." });
        clearAudio(session);
        session.recording = true;
        session.processing = false;
        session.turnId = 0;
        session.agentContext = agentContext;
        session.threadId = agentContext.threadId;
        session.languageCode = message.languageCode;
        session.mimeType = message.mimeType?.startsWith("audio/") ? message.mimeType : "audio/webm";
        return sendJson(socket, { type: "recording" });
      }

      if (message.type === "speech_start") {
        if (!Number.isSafeInteger(message.turnId) || message.turnId <= session.turnId) return;
        const interruptedTurnId = session.processing ? session.turnId : undefined;
        session.turnAbort?.abort();
        delete session.turnAbort;
        clearAudio(session);
        session.turnId = message.turnId;
        session.processing = false;
        session.recording = true;
        if (interruptedTurnId !== undefined) {
          console.info("voice.turn.cancelled", { sessionId, turnId: interruptedTurnId, replacementTurnId: message.turnId, reason: "barge_in" });
        }
        return sendJson(socket, { type: "listening", turnId: session.turnId });
      }

      if (message.type === "prompt") {
        if (
          !Number.isSafeInteger(message.turnId) ||
          message.turnId !== session.turnId ||
          session.processing ||
          !session.agentContext
        ) return;
        const turnId = session.turnId;
        const controller = new AbortController();
        session.turnAbort = controller;
        session.processing = true;
        session.recording = false;
        try {
          const prompt = await synthesizeVoicePrompt(message.kind, session.languageCode, session.agentContext, controller.signal);
          if (session.turnId === turnId && !controller.signal.aborted) {
            sendJson(socket, {
              type: "assistant_prompt",
              turnId,
              text: prompt.text,
              audioBase64: prompt.audioBase64,
              audioContentType: prompt.contentType,
            });
          }
        } catch (error) {
          if (!controller.signal.aborted && session.turnId === turnId) {
            console.warn("voice.prompt.failed", { sessionId, turnId, kind: message.kind, errorName: error instanceof Error ? error.name : "UnknownError" });
            sendJson(socket, { type: "assistant_prompt_error", turnId, message: "I couldn't play the voice prompt, but I'm still listening." });
          }
        } finally {
          if (session.turnId === turnId && session.turnAbort === controller) {
            session.processing = false;
            session.recording = true;
            delete session.turnAbort;
          }
        }
        return;
      }

      if (message.turnId !== session.turnId || session.processing || !session.recording) return;
      if (!session.totalBytes) {
        session.recording = false;
        return sendJson(socket, { type: "no_speech", turnId: session.turnId });
      }

      const turnId = session.turnId;
      const controller = new AbortController();
      session.turnAbort = controller;
      session.processing = true;
      session.recording = false;
      const audio = Buffer.concat(session.chunks);
      clearAudio(session);
      const startedAt = Date.now();
      console.info("voice.turn.started", { sessionId, turnId, bytes: audio.length, mimeType: session.mimeType });
      sendJson(socket, { type: "processing", turnId });
      try {
        const result = await processVoiceTurn({
          audio,
          mimeType: session.mimeType,
          languageCode: session.languageCode,
          threadId: session.threadId,
          agentContext: session.agentContext,
          signal: controller.signal,
          onProgress: (event) => {
            if (session.turnId === turnId && !controller.signal.aborted) sendJson(socket, { ...event, turnId });
          },
        });
        if (session.turnId === turnId && !controller.signal.aborted) {
          session.threadId = result.threadId;
          if (typeof result.languageCode === "string") session.languageCode = result.languageCode;
        }
        if (session.turnId === turnId && !controller.signal.aborted) {
          console.info("voice.turn.completed", { sessionId, turnId, durationMs: Date.now() - startedAt });
        }
      } catch (error) {
        if (!controller.signal.aborted && session.turnId === turnId) {
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode: unknown }).statusCode) : 0;
          if (statusCode === 422) sendJson(socket, { type: "no_speech", turnId });
          else {
            console.error("voice.turn.failed", {
              sessionId,
              turnId,
              durationMs: Date.now() - startedAt,
              statusCode: statusCode || undefined,
              errorName: error instanceof Error ? error.name : "UnknownError",
            });
            sendJson(socket, {
              type: "error",
              turnId,
              message: statusCode === 429
                ? "The speech service is busy. Please try again in a moment."
                : statusCode === 415
                  ? "The microphone audio format was not accepted. Please restart voice mode."
                  : "I couldn't complete that voice turn. Please try again.",
            });
          }
        }
      } finally {
        if (session.turnId === turnId) {
          session.processing = false;
          delete session.turnAbort;
        }
      }
    });

    socket.on("close", () => {
      if (session.turnAbort) console.info("voice.turn.cancelled", { sessionId, turnId: session.turnId, reason: "socket_closed" });
      session.turnAbort?.abort();
      session.recording = false;
      session.processing = false;
      clearAudio(session);
    });

    socket.on("error", (error) => {
      console.warn("voice.websocket.error", { sessionId, errorName: error.name, code: (error as NodeJS.ErrnoException).code });
    });
  });
};
