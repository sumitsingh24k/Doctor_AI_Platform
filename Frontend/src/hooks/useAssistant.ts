import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ChatMessage } from "../types/app";

export function useAssistant(setError: (message: string) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hi! I’m your Medimind care assistant. Tell me what you need, or tap the microphone and speak in your preferred language." },
  ]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const voiceSocket = useRef<WebSocket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text = input) => {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const result = await api<{ reply: string; threadId: string }>("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message, ...(threadId ? { threadId } : {}) }),
      });
      setThreadId(result.threadId);
      setMessages((current) => [...current, { role: "assistant", text: result.reply }]);
    } catch (reason) {
      setMessages((current) => [...current, { role: "assistant", text: reason instanceof Error ? reason.message : "I couldn't reach the assistant. Please try again." }]);
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: preferredType });
      mediaRecorder.current = recorder;
      const socketProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${socketProtocol}//${window.location.host}/ws/assistant/voice`);
      voiceSocket.current = socket;
      setBusy(true);
      let audioQueue = Promise.resolve();
      let responseReceived = false;

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        audioQueue = audioQueue.then(async () => {
          if (socket.readyState === WebSocket.OPEN) socket.send(await event.data.arrayBuffer());
        });
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setBusy(true);
        void audioQueue.then(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "commit" }));
        });
      };
      socket.onmessage = (event) => {
        let payload: { type?: string; threadId?: string; transcript?: string; reply?: string; audioBase64?: string; audioContentType?: string; message?: string };
        try {
          payload = JSON.parse(String(event.data)) as typeof payload;
        } catch {
          setError("The voice service returned an invalid response.");
          return;
        }
        if (payload.type === "ready") {
          socket.send(JSON.stringify({ type: "start", ...(threadId ? { threadId } : {}), mimeType: recorder.mimeType }));
        } else if (payload.type === "recording") {
          recorder.start(250);
          setRecording(true);
        } else if (payload.type === "transcript" && payload.transcript) {
          setMessages((current) => [...current, { role: "user", text: payload.transcript!, transcript: true }]);
        } else if (payload.type === "assistant_reply") {
          responseReceived = true;
          if (payload.threadId) setThreadId(payload.threadId);
          if (payload.reply) setMessages((current) => [...current, { role: "assistant", text: payload.reply! }]);
          if (payload.audioBase64 && payload.audioContentType) {
            const player = new Audio(`data:${payload.audioContentType};base64,${payload.audioBase64}`);
            void player.play().catch(() => undefined);
          }
          setBusy(false);
          socket.close();
        } else if (payload.type === "error") {
          setMessages((current) => [...current, { role: "assistant", text: payload.message || "Voice request failed. Please try again." }]);
          setRecording(false);
          setBusy(false);
          socket.close();
        }
      };
      socket.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setBusy(false);
        setError("Could not connect to the voice assistant. Please check that the backend is running.");
      };
      socket.onclose = () => {
        if (!responseReceived) {
          setBusy(false);
          setRecording(false);
        }
      };
    } catch {
      setBusy(false);
      setError("Microphone access is needed for voice conversations. Please allow it in your browser settings.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  };

  const stop = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
    voiceSocket.current?.close();
    voiceSocket.current = null;
  }, []);

  return { messages, input, setInput, send, busy, recording, startRecording, stopRecording, endRef, stop };
}
