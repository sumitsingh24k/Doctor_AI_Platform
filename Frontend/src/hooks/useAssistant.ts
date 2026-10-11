import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Doctor } from "../api";
import type { ChatMessage } from "../types/app";

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "interrupted" | "error";
const SILENCE_TO_COMMIT_MS = 1_700;
const SILENCE_PROMPT_DELAY_MS = 10_000;
const VAD_CALIBRATION_MS = 650;
// Sarvam's synchronous STT endpoint is intended for short interactive turns;
// keep uploads below its request timeout to avoid upstream 499s.
const MAX_TURN_MS = 28_000;

const encodeWav = (frames: Float32Array[], sampleRate: number) => {
  const sampleCount = frames.reduce((total, frame) => total + frame.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
  writeText(0, "RIFF"); view.setUint32(4, 36 + sampleCount * 2, true); writeText(8, "WAVE");
  writeText(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, "data"); view.setUint32(40, sampleCount * 2, true);
  let offset = 44;
  for (const frame of frames) for (const value of frame) {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
};

export function useAssistant(setError: (message: string) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const voiceSocket = useRef<WebSocket | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioSource = useRef<AudioBufferSourceNode | null>(null);
  const audioProcessor = useRef<ScriptProcessorNode | null>(null);
  const latestAssistantReply = useRef("");
  const endRef = useRef<HTMLDivElement>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  const voiceActiveRef = useRef(false);
  const startingRef = useRef(false);
  const speechActiveRef = useRef(false);
  const preRoll = useRef<Float32Array[]>([]);
  const utteranceFrames = useRef<Float32Array[]>([]);
  const sampleRate = useRef(48_000);
  const turnId = useRef(0);
  const lastSpeechAt = useRef(0);
  const speechStartedAt = useRef(0);
  const consecutiveSpeechFrames = useRef(0);
  const captureGeneration = useRef(0);
  const silencePromptTimer = useRef<number | undefined>(undefined);
  const silencePromptCount = useRef(0);

  const setVoice = useCallback((state: VoiceState) => {
    voiceStateRef.current = state;
    setVoiceState(state);
    setBusy(state === "processing" || state === "interrupted");
    setSpeaking(state === "speaking");
  }, []);

  useEffect(() => {
    void api<{ doctors: Doctor[] }>("/api/doctor/directory")
      .then(({ doctors: availableDoctors }) => {
        setDoctors(availableDoctors);
        if (availableDoctors.length === 1 && availableDoctors[0]) setSelectedDoctorId(availableDoctors[0]._id);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load clinics."))
      .finally(() => setDoctorsLoading(false));
  }, [setError]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text = input) => {
    const message = text.trim();
    if (!message || busy || voiceActiveRef.current) return;
    if (!doctors.length) return setError("No clinics are ready for online bookings yet. Please check again later.");
    if (doctors.length > 1 && !selectedDoctorId) return setError("Choose a clinic before chatting with the assistant.");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    const requestId = ++turnId.current;
    try {
      const result = await api<{ reply: string; threadId: string }>("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message, ...(selectedDoctorId ? { doctorId: selectedDoctorId } : {}), ...(threadId ? { threadId } : {}) }),
      });
      if (requestId !== turnId.current) return;
      setThreadId(result.threadId);
      setMessages((current) => [...current, { role: "assistant", text: result.reply }]);
    } catch (reason) {
      if (requestId === turnId.current) setMessages((current) => [...current, { role: "assistant", text: reason instanceof Error ? reason.message : "I couldn't reach the assistant. Please try again." }]);
    } finally {
      if (requestId === turnId.current) setBusy(false);
    }
  };

  const stop = useCallback(() => {
    captureGeneration.current += 1;
    if (silencePromptTimer.current !== undefined) window.clearTimeout(silencePromptTimer.current);
    silencePromptTimer.current = undefined;
    silencePromptCount.current = 0;
    voiceActiveRef.current = false;
    startingRef.current = false;
    speechActiveRef.current = false;
    setVoiceActive(false);
    setRecording(false);
    setVoice("idle");
    if (audioProcessor.current) {
      audioProcessor.current.onaudioprocess = null;
      try { audioProcessor.current.disconnect(); } catch { /* Processor may already be disconnected. */ }
    }
    audioProcessor.current = null;
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = null;
    if (audioContext.current && audioContext.current.state !== "closed") void audioContext.current.close().catch(() => undefined);
    audioContext.current = null;
    try { audioSource.current?.stop(); } catch { /* Playback may already have ended. */ }
    audioSource.current?.disconnect();
    audioSource.current = null;
    window.speechSynthesis?.cancel();
    const socket = voiceSocket.current;
    voiceSocket.current = null;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "reset" }));
    socket?.close();
    preRoll.current = [];
    utteranceFrames.current = [];
  }, [setVoice]);

  const finishUtterance = useCallback(() => {
    if (!speechActiveRef.current) return;
    speechActiveRef.current = false;
    setRecording(false);
    preRoll.current = [];
    const currentTurn = turnId.current;
    setVoice("processing");
    const socket = voiceSocket.current;
    if (!utteranceFrames.current.length || !socket || socket.readyState !== WebSocket.OPEN) {
      utteranceFrames.current = [];
      setVoice("listening");
      return;
    }
    const wav = encodeWav(utteranceFrames.current, sampleRate.current);
    utteranceFrames.current = [];
    if (currentTurn !== turnId.current || !voiceActiveRef.current) return;
    socket.send(wav);
    socket.send(JSON.stringify({ type: "commit", turnId: currentTurn }));
  }, [setVoice]);

  const startRecording = useCallback(async (doctorId = selectedDoctorId, conversationThreadId = threadId) => {
    if (voiceActiveRef.current || startingRef.current) return;
    if (!doctors.length) return setError("No clinics are ready for online bookings yet. Please check again later.");
    if (doctors.length > 1 && !doctorId) return setError("Choose a clinic before starting a voice conversation.");
    startingRef.current = true;
    turnId.current = 0;
    silencePromptCount.current = 0;
    const generation = ++captureGeneration.current;
    setError("");
    let stream: MediaStream | undefined;
    let socket: WebSocket | undefined;
    let context: AudioContext | undefined;
    let ready = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access requires HTTPS or localhost and a browser that supports audio capture.");
      }
      // Resume the playback context from the microphone button gesture. TTS
      // arrives later over the socket, outside the browser's autoplay gesture.
      try { context = new AudioContext({ sampleRate: 16_000 }); }
      catch { context = new AudioContext(); }
      audioContext.current = context;
      void context.resume().catch(() => undefined);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16_000 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      });
      if (generation !== captureGeneration.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      mediaStream.current = stream;
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          if (!voiceActiveRef.current || generation !== captureGeneration.current) return;
          setError("Microphone capture stopped. Check the microphone connection and try again.");
          stop();
          setVoice("error");
        }, { once: true });
      }
      const backendOrigin = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const socketUrl = new URL("/ws/assistant/voice", backendOrigin);
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(socketUrl.toString());
      voiceSocket.current = socket;
      sampleRate.current = context!.sampleRate;
      const captureSettings = stream.getAudioTracks()[0]?.getSettings();
      console.info("voice.capture.ready", {
        sampleRate: context!.sampleRate,
        channelCount: captureSettings?.channelCount,
        echoCancellation: captureSettings?.echoCancellation,
        noiseSuppression: captureSettings?.noiseSuppression,
        autoGainControl: captureSettings?.autoGainControl,
      });
      const source = context!.createMediaStreamSource(stream);
      const processor = context!.createScriptProcessor(1024, 1, 1);
      audioProcessor.current = processor;
      source.connect(processor);
      processor.connect(context!.destination);
      // Calibrate against the room/microphone before treating energy as
      // speech. Without this, a noisy microphone can start a turn
      // immediately and then never reach the silence threshold, so no audio
      // is ever committed to the backend for transcription.
      let noiseFloor = 0.0025;
      const vadReadyAt = Date.now() + VAD_CALIBRATION_MS;
      let speechStartFrames = 0;
      let sessionThreadId = conversationThreadId;

      const scheduleSilencePrompt = (expectedTurn: number) => {
        if (silencePromptCount.current >= 2 || !voiceActiveRef.current) return;
        if (silencePromptTimer.current !== undefined) window.clearTimeout(silencePromptTimer.current);
        silencePromptTimer.current = window.setTimeout(() => {
          silencePromptTimer.current = undefined;
          const activeSocket = voiceSocket.current;
          if (
            !voiceActiveRef.current ||
            speechActiveRef.current ||
            voiceStateRef.current !== "listening" ||
            expectedTurn !== turnId.current ||
            !activeSocket ||
            activeSocket.readyState !== WebSocket.OPEN
          ) return;
          const kind = silencePromptCount.current === 0 ? "follow_up" : "final_check_in";
          silencePromptCount.current += 1;
          activeSocket.send(JSON.stringify({ type: "prompt", kind, turnId: expectedTurn }));
        }, SILENCE_PROMPT_DELAY_MS);
      };

      const beginUtterance = () => {
        const activeSocket = voiceSocket.current;
        if (!voiceActiveRef.current || !activeSocket || activeSocket.readyState !== WebSocket.OPEN || speechActiveRef.current) return;
        const previousState = voiceStateRef.current;
        const interrupted = previousState === "speaking" || previousState === "processing";
        if (silencePromptTimer.current !== undefined) window.clearTimeout(silencePromptTimer.current);
        silencePromptTimer.current = undefined;
        silencePromptCount.current = 0;
        speechActiveRef.current = true;
        speechStartFrames = 0;
        turnId.current += 1;
        const currentTurn = turnId.current;
        speechStartedAt.current = Date.now();
        lastSpeechAt.current = speechStartedAt.current;
        utteranceFrames.current = preRoll.current.slice();
        preRoll.current = [];
        setRecording(true);
        setVoice(interrupted ? "interrupted" : "listening");
        try { audioSource.current?.stop(); } catch { /* Playback may already have ended. */ }
        audioSource.current?.disconnect();
        audioSource.current = null;
        activeSocket.send(JSON.stringify({ type: "speech_start", turnId: currentTurn }));
        if (interrupted) window.setTimeout(() => {
          if (voiceActiveRef.current && speechActiveRef.current && turnId.current === currentTurn) setVoice("listening");
        }, 120);
      };

      processor.onaudioprocess = (event) => {
        const output = event.outputBuffer.getChannelData(0);
        output.fill(0);
        if (!voiceActiveRef.current || generation !== captureGeneration.current) return;
        const input = event.inputBuffer.getChannelData(0);
        const frame = new Float32Array(input);
        let sum = 0;
        for (const sample of frame) sum += sample * sample;
        const rms = Math.sqrt(sum / frame.length);
        const active = speechActiveRef.current;
        // Adaptive energy VAD with a lower start threshold for quiet speech
        // and hysteresis once an utterance has started. Browser capture also
        // requests hardware echo cancellation and noise suppression above.
        const startThreshold = Math.max(0.012, noiseFloor * 2.8);
        const continueThreshold = Math.max(0.007, noiseFloor * 1.7);
        if (active) utteranceFrames.current.push(frame);
        else {
          preRoll.current.push(frame);
          while (preRoll.current.reduce((total, chunk) => total + chunk.length, 0) > sampleRate.current * 0.8) preRoll.current.shift();
          if (voiceStateRef.current !== "speaking" && rms < Math.max(0.04, noiseFloor * 3.5)) {
            // A faster update during the brief initial calibration makes this
            // work consistently across laptop and phone microphones.
            const weight = Date.now() < vadReadyAt ? 0.18 : 0.03;
            noiseFloor = noiseFloor * (1 - weight) + rms * weight;
          }
        }
        if (!active && Date.now() < vadReadyAt) return;
        const speechLike = rms > (active ? continueThreshold : startThreshold);
        if (speechLike) {
          consecutiveSpeechFrames.current += 1;
          if (active) {
            lastSpeechAt.current = Date.now();
          } else {
            speechStartFrames += 1;
            if (speechStartFrames >= 5) beginUtterance();
          }
        } else {
          consecutiveSpeechFrames.current = 0;
          speechStartFrames = 0;
        }
        const now = Date.now();
        if (speechActiveRef.current && (now - lastSpeechAt.current >= SILENCE_TO_COMMIT_MS || now - speechStartedAt.current >= MAX_TURN_MS)) finishUtterance();
      };

      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(() => {
          if (socket?.readyState === WebSocket.CONNECTING) socket.close();
          setError(`Voice server at ${socketUrl.host} did not respond. Check the backend and /ws proxy.`);
          resolve();
        }, 12_000);
        socket!.onopen = () => {
          if (generation !== captureGeneration.current) return socket!.close();
          socket!.send(JSON.stringify({ type: "start", ...(doctorId ? { doctorId } : {}), ...(sessionThreadId ? { threadId: sessionThreadId } : {}), mimeType: "audio/wav" }));
        };
        socket!.onmessage = (event) => {
          let payload: { type?: string; turnId?: number; threadId?: string; transcript?: string; reply?: string; text?: string; audioBase64?: string; audioContentType?: string; message?: string };
          try { payload = JSON.parse(String(event.data)) as typeof payload; }
          catch { setError("The voice service returned an invalid response."); return; }
          if (payload.type === "error" && !ready) {
            window.clearTimeout(timeout);
            setError(payload.message || "Could not start the voice assistant.");
            socket!.close();
            resolve();
            return;
          }
          if (payload.type === "recording") {
            ready = true;
            window.clearTimeout(timeout);
            if (generation !== captureGeneration.current) return;
            voiceActiveRef.current = true;
            setVoiceActive(true);
            startingRef.current = false;
            setVoice("listening");
            void context!.resume().catch(() => undefined);
            socket!.send(JSON.stringify({ type: "prompt", kind: "welcome", turnId: turnId.current }));
            resolve();
            return;
          }
          if (payload.turnId !== undefined && payload.turnId !== turnId.current) return;
          if (payload.type === "listening") {
            if (!speechActiveRef.current) setVoice("listening");
          } else if (payload.type === "processing") {
            setVoice("processing");
          } else if (payload.type === "transcript" && payload.transcript) {
            setMessages((current) => [...current, { role: "user", text: payload.transcript!, transcript: true }]);
          } else if (payload.type === "assistant_reply") {
            if (payload.threadId) { sessionThreadId = payload.threadId; setThreadId(payload.threadId); }
            if (payload.reply) {
              latestAssistantReply.current = payload.reply;
              setMessages((current) => [...current, { role: "assistant", text: payload.reply! }]);
            }
          } else if ((payload.type === "assistant_audio" || payload.type === "assistant_prompt") && payload.audioBase64 && payload.audioContentType) {
            const currentTurn = payload.turnId ?? turnId.current;
            if (payload.type === "assistant_prompt" && payload.text) {
              setMessages((current) => [...current, { role: "assistant", text: payload.text! }]);
            }
            void (async () => {
              try {
                const encoded = atob(payload.audioBase64!);
                const bytes = new Uint8Array(encoded.length);
                for (let index = 0; index < encoded.length; index += 1) bytes[index] = encoded.charCodeAt(index);
                const buffer = await context!.decodeAudioData(bytes.buffer);
                await context!.resume();
                if (!voiceActiveRef.current || generation !== captureGeneration.current || currentTurn !== turnId.current) return;
                const sourceNode = context!.createBufferSource();
                sourceNode.buffer = buffer;
                sourceNode.connect(context!.destination);
                audioSource.current = sourceNode;
                sourceNode.onended = () => {
                  if (audioSource.current !== sourceNode) return;
                  sourceNode.disconnect();
                  audioSource.current = null;
                  if (currentTurn === turnId.current) {
                    setVoice(voiceActiveRef.current ? "listening" : "idle");
                    scheduleSilencePrompt(currentTurn);
                  }
                };
                setVoice("speaking");
                sourceNode.start();
              } catch (reason) {
                if (currentTurn !== turnId.current || generation !== captureGeneration.current) return;
                setError(reason instanceof Error ? `Voice response could not play: ${reason.message}` : "Voice response could not play. Tap the microphone and try again.");
                setVoice("error");
              }
            })();
          } else if (payload.type === "assistant_audio_error") {
            // Sarvam TTS can be unavailable (for example due to a corporate
            // firewall). Keep the voice conversation usable with the device's
            // local speech engine rather than leaving the reply silent.
            const fallbackText = latestAssistantReply.current;
            if (fallbackText && "speechSynthesis" in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(fallbackText);
              utterance.lang = /[\u0900-\u097F]/.test(fallbackText) ? "hi-IN" : "en-IN";
              utterance.rate = 0.95;
              utterance.onend = () => {
                if (generation === captureGeneration.current && voiceActiveRef.current) setVoice("listening");
              };
              utterance.onerror = () => {
                if (generation === captureGeneration.current && voiceActiveRef.current) setVoice("listening");
              };
              setVoice("speaking");
              window.speechSynthesis.speak(utterance);
            } else {
              setError(payload.message || "Your reply is ready, but voice playback could not be generated.");
              setVoice("listening");
            }
          } else if (payload.type === "no_speech") {
            setVoice("listening");
            scheduleSilencePrompt(payload.turnId ?? turnId.current);
          } else if (payload.type === "assistant_prompt_error") {
            setError(payload.message || "I'm still listening. Please continue when you're ready.");
            setVoice("listening");
          } else if (payload.type === "error") {
            setError(payload.message || "Voice request failed. Please try again.");
            setVoice("error");
          }
        };
        socket!.onerror = () => {
          window.clearTimeout(timeout);
          if (!ready) setError(`Could not connect to the voice server at ${socketUrl.host}. Check VITE_BACKEND_URL and the /ws proxy.`);
          if (generation === captureGeneration.current) { stop(); setVoice("error"); }
          resolve();
        };
        socket!.onclose = () => {
          window.clearTimeout(timeout);
          if (generation === captureGeneration.current && voiceActiveRef.current) {
            setError("Voice connection closed. Start the microphone to try again.");
            stop();
            setVoice("error");
          }
          if (!ready) resolve();
        };
      });
      if (generation !== captureGeneration.current) return;
      if (ready) return;
      stop();
      setVoice("error");
    } catch (reason) {
      stop();
      setVoice("error");
      setError(reason instanceof Error && (reason.name === "NotAllowedError" || reason.name === "SecurityError")
        ? "Microphone permission was blocked. Allow microphone access for this site, then try again."
        : reason instanceof Error && reason.name === "NotFoundError"
          ? "No microphone was found. Connect a microphone and try again."
          : reason instanceof Error && reason.name === "NotReadableError"
            ? "The microphone is already in use or unavailable. Close other recording apps and try again."
            : reason instanceof Error ? reason.message : "Could not start the microphone.");
    }
  }, [doctors.length, finishUtterance, selectedDoctorId, setError, setVoice, stop, threadId]);

  const stopRecording = useCallback(() => {
    if (speechActiveRef.current) finishUtterance();
  }, [finishUtterance]);

  const openVoiceConversation = useCallback((doctor: Doctor) => {
    stop();
    setSelectedDoctorId(doctor._id);
    setThreadId("");
    setMessages([]);
    setInput("");
    void startRecording(doctor._id, "");
  }, [startRecording, stop]);

  const reset = useCallback(() => {
    stop();
    turnId.current += 1;
    setMessages([]);
    setInput("");
    setThreadId("");
    setSelectedDoctorId(doctors.length === 1 && doctors[0] ? doctors[0]._id : "");
  }, [doctors, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    messages, input, setInput, send, busy, recording, speaking, voiceActive, voiceState,
    startRecording, stopRecording, endRef, stop, reset, doctors, doctorsLoading,
    selectedDoctorId, setSelectedDoctorId, openVoiceConversation,
  };
}
