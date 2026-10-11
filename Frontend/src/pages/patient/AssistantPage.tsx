import {
  ArrowRight, AudioLines, CalendarDays, CheckCircle2, HeartPulse, Mic, MicOff, Send, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import type { RefObject } from "react";
import type { ChatMessage } from "../../types/app";
import type { Doctor } from "../../api";

export function AssistantPage({
  messages, input, setInput, send, busy, recording, speaking, voiceActive, voiceState, startRecording, stopVoice, onBrowseDoctors, endRef,
  doctors, doctorsLoading, selectedDoctorId, setSelectedDoctorId,
  doctorMode = false,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  send: () => void;
  busy: boolean;
  recording: boolean;
  speaking: boolean;
  voiceActive: boolean;
  voiceState: "idle" | "listening" | "processing" | "speaking" | "interrupted" | "error";
  startRecording: () => void;
  stopVoice: () => void;
  onBrowseDoctors: () => void;
  endRef: RefObject<HTMLDivElement>;
  doctors: Doctor[];
  doctorsLoading: boolean;
  selectedDoctorId: string;
  setSelectedDoctorId: (doctorId: string) => void;
  doctorMode?: boolean;
}) {
  const voiceStatus = voiceState === "speaking" ? "Speaking. Interrupt me any time."
    : voiceState === "processing" ? "Understanding your question…"
      : voiceState === "interrupted" ? "Stopping the last reply; listening…"
        : voiceState === "error" ? "Voice assistant needs attention. You can try speaking again."
          : voiceActive ? "Listening continuously. Speak naturally or interrupt me."
            : "Tap the microphone to start a voice conversation.";
  return <div className="assistant-layout">
    <div className="assistant-main"><div className="assistant-header"><div className="assistant-avatar"><Sparkles size={20} /></div><div><div className="assistant-title">{doctorMode ? "Clinic voice playground" : "Your care assistant"} <span className="online-dot" /></div><div className="assistant-subtitle">{doctorMode ? "Test your configured clinic assistant" : "Here to help, whenever you need"}</div></div>{doctors.length > 1 && <label className="assistant-clinic-picker">Clinic<select value={selectedDoctorId} onChange={(event) => { stopVoice(); setSelectedDoctorId(event.target.value); }} aria-label="Choose a clinic"><option value="">Choose a clinic</option>{doctors.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.clinicName} · {doctor.name}</option>)}</select></label>}<div className="powered-by"><ShieldCheck size={14} />Private conversation</div></div>
      {!doctorsLoading && !doctors.length && <div className="assistant-clinic-empty" role="status">No clinics are ready for online bookings yet. Please check again later.</div>}
      <div className="chat-thread">{messages.length === 0 && <div className="assistant-empty-state"><div className="assistant-empty-mark"><AudioLines size={21} /></div><b>{voiceActive ? "Listening for your question" : doctorMode ? "Test a real clinic conversation" : "Start with what you need"}</b><span>{doctors[0] ? `${doctors[0].clinicName} · ${doctors[0].name}` : "Choose a clinic to begin."} Ask about clinic hours, appointments, or your next step.</span></div>}{messages.map((message, index) => <div className={`message-row ${message.role === "user" ? "message-user" : ""}`} key={`${index}-${message.text.slice(0, 12)}`}>{message.role === "assistant" && <div className="message-avatar"><Sparkles size={13} /></div>}<div className={`message-bubble ${message.role === "user" ? "user-bubble" : ""}`}>{message.transcript && <span className="transcript-label"><AudioLines size={12} />VOICE TRANSCRIPT</span>}{message.text}{!doctorMode && message.role === "assistant" && index === 0 && <button className="assistant-book-card" onClick={onBrowseDoctors}><span className="assistant-book-icon"><CalendarDays size={15} /></span><span><b>Find a doctor & check available times</b><small>Choose a clinic and confirm your visit</small></span><ArrowRight size={15} /></button>}</div>{message.role === "user" && <div className="message-user-avatar"><Users size={14} /></div>}</div>)}{busy && !recording && !speaking && <div className="message-row"><div className="message-avatar"><Sparkles size={13} /></div><div className="message-bubble typing"><i /><i /><i /></div></div>}<div ref={endRef} /></div>
      <div className="chat-composer-wrap"><div className={`voice-banner ${recording ? "voice-recording" : speaking ? "voice-speaking" : ""}`}><div className="voice-state-icon">{voiceActive ? voiceState === "processing" ? <Sparkles size={17} /> : voiceState === "speaking" ? <AudioLines size={17} /> : <Mic size={16} /> : <Mic size={16} />}</div><span>{voiceStatus}</span>{voiceActive && voiceState === "listening" && <div className="voice-waveform" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>}<span className="language-chip">EN · HI</span></div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><button className={`mic-button ${voiceActive ? "is-recording" : ""}`} type="button" onClick={voiceActive ? stopVoice : startRecording} disabled={!voiceActive && (busy || speaking)} aria-label={voiceActive ? "Stop voice assistant" : "Start voice chat"}>{voiceActive ? <MicOff size={19} /> : <Mic size={19} />}</button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about finding or booking care…" aria-label="Message your care assistant" disabled={voiceActive} /><button className="send-button" type="submit" disabled={!input.trim() || busy || voiceActive} aria-label="Send message"><Send size={17} /></button></form><div className="composer-caption"><span>Medimind can help with appointments, but isn’t a substitute for emergency care.</span><span>Powered by AI · Private conversation</span></div></div>
    </div>
    <aside className="assistant-side"><div className="side-assistant-card"><div className="side-card-top"><div className="side-sparkle"><Sparkles size={17} /></div><span>{doctorMode ? "CLINIC AGENT PREVIEW" : "MEDIMIND ASSISTANT"}</span></div><h3>{doctorMode ? <>Try a real<br />clinic conversation.</> : <>A little help,<br />right when you need it.</>}</h3><p>{doctorMode ? "Speak as a patient and check how your configured clinic assistant responds using its real tools." : "Find a specialist, check appointment times, or ask a question. You can speak in Hindi or English."}</p><div className="assistant-capabilities"><div><CheckCircle2 size={15} />{doctorMode ? "Clinic profile context" : "Discover nearby doctors"}</div><div><CheckCircle2 size={15} />Check clinic availability</div><div><CheckCircle2 size={15} />Talk naturally by voice</div></div><div className="side-ai-decoration"><AudioLines size={34} /></div></div><div className="quick-prompts"><div className="quick-title">{doctorMode ? "TRY A SCENARIO" : "TRY ASKING"}</div><button onClick={() => setInput(doctorMode ? "What are the clinic hours?" : "Help me find a heart specialist near me")}>{doctorMode ? "“What are the clinic hours?”" : "“Help me find a heart specialist”"}<ArrowRight size={14} /></button><button onClick={() => setInput("I need to book an appointment this week")}>“Book an appointment this week”<ArrowRight size={14} /></button><button onClick={() => setInput(doctorMode ? "What should a patient bring to a first visit?" : "What should I bring to my first visit?")}>{doctorMode ? "“What should I bring?”" : "“What should I bring to my first visit?”"}<ArrowRight size={14} /></button></div>{!doctorMode && <div className="emergency-note"><HeartPulse size={16} /><span><b>Need urgent help?</b><small>For emergencies, contact local emergency services now.</small></span></div>}</aside>
  </div>;
}
