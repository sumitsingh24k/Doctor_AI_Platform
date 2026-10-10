import {
  ArrowRight, AudioLines, CalendarDays, CheckCircle2, HeartPulse, Mic, MicOff, Send, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import type { RefObject } from "react";
import type { ChatMessage } from "../../types/app";

export function AssistantPage({
  messages, input, setInput, send, busy, recording, startRecording, stopRecording, onBrowseDoctors, endRef,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  send: () => void;
  busy: boolean;
  recording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  onBrowseDoctors: () => void;
  endRef: RefObject<HTMLDivElement>;
}) {
  return <div className="assistant-layout">
    <div className="assistant-main"><div className="assistant-header"><div className="assistant-avatar"><Sparkles size={20} /></div><div><div className="assistant-title">Your care assistant <span className="online-dot" /></div><div className="assistant-subtitle">Here to help, whenever you need</div></div><div className="powered-by"><ShieldCheck size={14} />Private conversation</div></div>
      <div className="chat-thread">{messages.map((message, index) => <div className={`message-row ${message.role === "user" ? "message-user" : ""}`} key={`${index}-${message.text.slice(0, 12)}`}>{message.role === "assistant" && <div className="message-avatar"><Sparkles size={13} /></div>}<div className={`message-bubble ${message.role === "user" ? "user-bubble" : ""}`}>{message.transcript && <span className="transcript-label"><AudioLines size={12} />VOICE TRANSCRIPT</span>}{message.text}{message.role === "assistant" && index === 0 && <button className="assistant-book-card" onClick={onBrowseDoctors}><span className="assistant-book-icon"><CalendarDays size={15} /></span><span><b>Find a doctor & check available times</b><small>Choose a clinic and confirm your visit</small></span><ArrowRight size={15} /></button>}</div>{message.role === "user" && <div className="message-user-avatar"><Users size={14} /></div>}</div>)}{busy && <div className="message-row"><div className="message-avatar"><Sparkles size={13} /></div><div className="message-bubble typing"><i /><i /><i /></div></div>}<div ref={endRef} /></div>
      <div className="chat-composer-wrap"><div className={`voice-banner ${recording ? "voice-recording" : ""}`}><div className="voice-state-icon">{recording ? <AudioLines size={17} /> : <Mic size={16} />}</div><span>{recording ? "Listening… tap the microphone when you’re done" : "You can speak naturally. Your words will appear here."}</span>{recording && <div className="voice-waveform" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>}<span className="language-chip">EN · HI</span></div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><button className={`mic-button ${recording ? "is-recording" : ""}`} type="button" onClick={recording ? stopRecording : startRecording} aria-label={recording ? "Stop recording" : "Start voice chat"}>{recording ? <MicOff size={19} /> : <Mic size={19} />}</button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about finding or booking care…" aria-label="Message your care assistant" /><button className="send-button" type="submit" disabled={!input.trim() || busy} aria-label="Send message"><Send size={17} /></button></form><div className="composer-caption"><span>Medimind can help with appointments, but isn’t a substitute for emergency care.</span><span>Powered by AI · <a href="#privacy">Privacy</a></span></div></div>
    </div>
    <aside className="assistant-side"><div className="side-assistant-card"><div className="side-card-top"><div className="side-sparkle"><Sparkles size={17} /></div><span>MEDIMIND ASSISTANT</span></div><h3>A little help,<br />right when you need it.</h3><p>Find a specialist, check appointment times, or ask a question. You can speak in Hindi or English.</p><div className="assistant-capabilities"><div><CheckCircle2 size={15} />Discover nearby doctors</div><div><CheckCircle2 size={15} />Check clinic availability</div><div><CheckCircle2 size={15} />Talk naturally by voice</div></div><div className="side-ai-decoration"><AudioLines size={34} /></div></div><div className="quick-prompts"><div className="quick-title">TRY ASKING</div><button onClick={() => setInput("Help me find a heart specialist near me")}>“Help me find a heart specialist”<ArrowRight size={14} /></button><button onClick={() => setInput("I need to book an appointment this week")}>“Book an appointment this week”<ArrowRight size={14} /></button><button onClick={() => setInput("What should I bring to my first visit?")}>“What should I bring to my first visit?”<ArrowRight size={14} /></button></div><div className="emergency-note"><HeartPulse size={16} /><span><b>Need urgent help?</b><small>For emergencies, contact local emergency services now.</small></span></div></aside>
  </div>;
}
