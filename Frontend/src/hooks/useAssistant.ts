import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Doctor } from "../api";
import type { ChatMessage } from "../types/app";

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "interrupted" | "error";
// Keep each request short. A 28-second raw WAV was making Sarvam wait for a
// large upload and often transcribe repeated background/echo speech.
const SILENCE_TO_COMMIT_MS = 900;
const SILENCE_PROMPT_DELAY_MS = 10_000;
const SPEECH_START_FRAMES = 2;
const TTS_FAST_FALLBACK_DELAY_MS = 1_250;
// Sarvam's synchronous STT endpoint is intended for short interactive turns;
// keep uploads below its request timeout to avoid upstream 499s.
const MAX_TURN_MS = 10_000;

type BrowserRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type BrowserRecognitionEvent = { resultIndex: number; results: ArrayLike<BrowserRecognitionResult> };
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const getBrowserSpeechRecognition = () => {
  const browser = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
};

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
  const browserRecognition = useRef<BrowserSpeechRecognition | null>(null);
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
  const replySpeechTimer = useRef<number | undefined>(undefined);
  const browserSpeechTurn = useRef<number | undefined>(undefined);
  const directoryRequestId = useRef(0);

  const setVoice = useCallback((state: VoiceState) => {
    voiceStateRef.current = state;
    setVoiceState(state);
    setBusy(state === "processing" || state === "interrupted");
    setSpeaking(state === "speaking");
  }, []);

  const loadDoctors = useCallback(async () => {
    const requestId = ++directoryRequestId.current;
    setDoctorsLoading(true);

    // Vite and the API server are often started independently in development.
    // Retry briefly so a page opened during API startup does not get stuck with
    // an empty clinic list for the rest of the session.
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { doctors: availableDoctors } = await api<{ doctors: Doctor[] }>("/api/doctor/directory");
          if (requestId !== directoryRequestId.current) return;

          setDoctors(availableDoctors);
          if (availableDoctors.length === 1 && availableDoctors[0]) setSelectedDoctorId(availableDoctors[0]._id);
          if (availableDoctors.length > 0) {
            setError("");
            return;
          }
        } catch (reason) {
          lastError = reason;
        }

        if (attempt < 2) await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
        if (requestId !== directoryRequestId.current) return;
      }

      if (lastError) {
        setError("Could not load clinics. Check that the backend is running, then retry.");
      }
    } finally {
      if (requestId === directoryRequestId.current) setDoctorsLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadDoctors();
    return () => { directoryRequestId.current += 1; };
  }, [loadDoctors]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text = input) => {
    const message = text.trim();
    if (!message || busy || voiceActiveRef.current) return;
    if (doctorsLoading) return setError("Clinic directory is loading. Please wait a moment.");
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
    if (replySpeechTimer.current !== undefined) window.clearTimeout(replySpeechTimer.current);
    replySpeechTimer.current = undefined;
    browserSpeechTurn.current = undefined;
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
    browserRecognition.current?.abort();
    browserRecognition.current = null;
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

  const submitLiveTranscript = useCallback(async (transcript: string, doctorId: string, conversationThreadId: string) => {
    const message = transcript.trim();
    if (!message || !voiceActiveRef.current) return;
    const requestId = ++turnId.current;
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message, transcript: true }]);
    setVoice("processing");
    try {
      const result = await api<{ reply: string; threadId: string }>("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message, ...(doctorId ? { doctorId } : {}), ...(conversationThreadId ? { threadId: conversationThreadId } : {}) }),
      });
      if (requestId !== turnId.current || !voiceActiveRef.current) return;
      setThreadId(result.threadId);
      latestAssistantReply.current = result.reply;
      setMessages((current) => [...current, { role: "assistant", text: result.reply }]);

      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(result.reply);
        utterance.lang = /[\u0900-\u097F]/.test(result.reply) ? "hi-IN" : "en-IN";
        utterance.rate = 1;
        utterance.onend = utterance.onerror = () => {
          if (requestId !== turnId.current || !voiceActiveRef.current) return;
          setVoice("listening");
          try { browserRecognition.current?.start(); } catch { /* Recognition is already active or restarting. */ }
        };
        setVoice("speaking");
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } else {
        setVoice("listening");
        try { browserRecognition.current?.start(); } catch { /* Recognition is already active or restarting. */ }
      }
    } catch (reason) {
      if (requestId !== turnId.current || !voiceActiveRef.current) return;
      setError(reason instanceof Error ? reason.message : "I couldn't reach the assistant. Please try again.");
      setVoice("listening");
      try { browserRecognition.current?.start(); } catch { /* Recognition is already active or restarting. */ }
    }
  }, [setError, setVoice]);

  const startRecording = useCallback(async (doctorId = selectedDoctorId, conversationThreadId = threadId) => {
    if (voiceActiveRef.current || startingRef.current) return;
    if (doctorsLoading) return setError("Clinic directory is loading. Please wait a moment.");
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
      const BrowserRecognition = getBrowserSpeechRecognition();
      if (BrowserRecognition) {
        const recognition = new BrowserRecognition();
        browserRecognition.current = recognition;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = navigator.language.toLowerCase().startsWith("hi") ? "hi-IN" : "en-IN";
        let finalTranscript = "";
        recognition.onresult = (event) => {
          if (!voiceActiveRef.current || generation !== captureGeneration.current) return;
          let interimTranscript = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (!result) continue;
            const text = result[0]?.transcript?.trim() ?? "";
            if (!text) continue;
            if (result.isFinal) finalTranscript = `${finalTranscript} ${text}`.trim();
            else interimTranscript = `${interimTranscript} ${text}`.trim();
          }
          // The disabled composer becomes a real-time caption while speaking.
          setInput(`${finalTranscript} ${interimTranscript}`.trim());
          if (finalTranscript) {
            recognition.stop();
            const completedTranscript = finalTranscript;
            finalTranscript = "";
            void submitLiveTranscript(completedTranscript, doctorId, conversationThreadId);
          }
        };
        recognition.onerror = (event) => {
          if (generation !== captureGeneration.current || !voiceActiveRef.current) return;
          if (event.error === "no-speech") return;
          setError(event.error === "not-allowed"
            ? "Microphone permission was blocked. Allow microphone access for this site, then try again."
            : "Live speech recognition stopped. Please try the microphone again.");
          setVoice("error");
        };
        recognition.onend = () => {
          if (generation !== captureGeneration.current || !voiceActiveRef.current) return;
          if (voiceStateRef.current === "listening") {
            try { recognition.start(); } catch { /* A final transcript is already being processed. */ }
          }
        };
        voiceActiveRef.current = true;
        setVoiceActive(true);
        startingRef.current = false;
        setVoice("listening");
        recognition.start();
        return;
      }
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
      // Keep the voice gate sensitive enough for phone and laptop mics. The
      // earlier calibration gate could learn the first words as background
      // noise, so speech_start was never sent and the backend received no
      // audio to transcribe.
      let noiseFloor = 0.001;
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

      const clearReplySpeechFallback = () => {
        if (replySpeechTimer.current !== undefined) window.clearTimeout(replySpeechTimer.current);
        replySpeechTimer.current = undefined;
      };

      const playWithBrowserSpeech = (text: string, currentTurn: number) => {
        if (!text || !("speechSynthesis" in window)) return false;
        browserSpeechTurn.current = currentTurn;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
        utterance.rate = 1;
        utterance.onend = utterance.onerror = () => {
          if (browserSpeechTurn.current !== currentTurn) return;
          browserSpeechTurn.current = undefined;
          if (generation === captureGeneration.current && voiceActiveRef.current && currentTurn === turnId.current) {
            setVoice("listening");
            scheduleSilencePrompt(currentTurn);
          }
        };
        setVoice("speaking");
        window.speechSynthesis.speak(utterance);
        return true;
      };

      const scheduleFastSpeechFallback = (text: string, currentTurn: number) => {
        clearReplySpeechFallback();
        browserSpeechTurn.current = undefined;
        replySpeechTimer.current = window.setTimeout(() => {
          replySpeechTimer.current = undefined;
          if (
            generation !== captureGeneration.current ||
            !voiceActiveRef.current ||
            currentTurn !== turnId.current ||
            browserSpeechTurn.current === currentTurn
          ) return;
          playWithBrowserSpeech(text, currentTurn);
        }, TTS_FAST_FALLBACK_DELAY_MS);
      };

      const beginUtterance = () => {
        const activeSocket = voiceSocket.current;
        if (
          !voiceActiveRef.current ||
          !activeSocket ||
          activeSocket.readyState !== WebSocket.OPEN ||
          speechActiveRef.current ||
          // A committed voice turn is transcribing/answering on the server.
          // Starting another one here aborts it as a `barge_in`, which is why
          // uploaded audio never produced a transcript. Keep one turn in
          // flight; listening resumes automatically after its reply.
          voiceStateRef.current === "speaking" ||
          voiceStateRef.current === "processing" ||
          voiceStateRef.current === "interrupted"
        ) return;
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
        setVoice("listening");
        try { audioSource.current?.stop(); } catch { /* Playback may already have ended. */ }
        audioSource.current?.disconnect();
        audioSource.current = null;
        activeSocket.send(JSON.stringify({ type: "speech_start", turnId: currentTurn }));
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
        // Adaptive VAD with threshold caps: a loud room cannot make the
        // threshold exceed the level of a normally spoken quiet voice. While
        // TTS is playing we intentionally require a louder signal so the
        // device speaker does not interrupt its own reply.
        const isAssistantSpeaking = voiceStateRef.current === "speaking";
        // On speakers and many phones, the assistant's own audio reaches the
        // microphone. Do not treat it as patient speech; it was repeatedly
        // cancelling turn 0 as a false `barge_in` before any real transcript
        // could be uploaded. Listening resumes automatically on audio end.
        if (!active && (isAssistantSpeaking || voiceStateRef.current === "processing" || voiceStateRef.current === "interrupted")) {
          preRoll.current = [];
          speechStartFrames = 0;
          consecutiveSpeechFrames.current = 0;
          return;
        }
        const startThreshold = isAssistantSpeaking
          ? Math.max(0.012, noiseFloor * 2.4)
          : Math.max(0.0025, Math.min(0.006, noiseFloor * 1.9));
        // Once speech has started, retain normal speech but reject very quiet
        // room noise that otherwise prevents the 900 ms silence commit.
        const continueThreshold = Math.max(0.004, Math.min(0.008, noiseFloor * 2.2));
        if (active) utteranceFrames.current.push(frame);
        else {
          preRoll.current.push(frame);
          while (preRoll.current.reduce((total, chunk) => total + chunk.length, 0) > sampleRate.current * 0.8) preRoll.current.shift();
          if (voiceStateRef.current !== "speaking" && rms < 0.012) {
            // Adapt slowly and only to low-level sound. In particular, never
            // learn the patient's first words as the ambient noise floor.
            noiseFloor = noiseFloor * 0.97 + rms * 0.03;
          }
        }
        const speechLike = rms > (active ? continueThreshold : startThreshold);
        if (speechLike) {
          consecutiveSpeechFrames.current += 1;
          if (active) {
            lastSpeechAt.current = Date.now();
          } else {
            speechStartFrames += 1;
            if (speechStartFrames >= SPEECH_START_FRAMES) beginUtterance();
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
              scheduleFastSpeechFallback(payload.reply, payload.turnId ?? turnId.current);
            }
          } else if ((payload.type === "assistant_audio" || payload.type === "assistant_prompt") && payload.audioBase64 && payload.audioContentType) {
            const currentTurn = payload.turnId ?? turnId.current;
            clearReplySpeechFallback();
            if (payload.type === "assistant_prompt" && payload.text) {
              setMessages((current) => [...current, { role: "assistant", text: payload.text! }]);
            }
            // The browser fallback has already started speaking this reply.
            // Ignore delayed provider audio so the patient never hears it twice.
            if (payload.type === "assistant_audio" && browserSpeechTurn.current === currentTurn) return;
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
            clearReplySpeechFallback();
            if (fallbackText && playWithBrowserSpeech(fallbackText, payload.turnId ?? turnId.current)) {
              // Browser speech is deliberately used as a reliable fallback
              // when Sarvam cannot produce or return a playable audio file.
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
  }, [doctors.length, finishUtterance, selectedDoctorId, setError, setVoice, stop, submitLiveTranscript, threadId]);

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
    startRecording, stopRecording, endRef, stop, reset, doctors, doctorsLoading, loadDoctors,
    selectedDoctorId, setSelectedDoctorId, openVoiceConversation,
  };
}
