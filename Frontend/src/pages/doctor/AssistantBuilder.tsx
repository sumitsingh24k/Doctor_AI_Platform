import { useState } from "react";
import { Activity, AudioLines, BookOpen, Check, GitBranch, Mic, Play, Save, Sparkles, Wrench } from "lucide-react";
import { api } from "../../api";

const stages = [
  { id: "patient-message", title: "Patient message", detail: "A patient's spoken or typed question enters the clinic assistant.", icon: Mic },
  { id: "intent-detection", title: "Understand intent", detail: "The assistant follows the conversation and identifies the next useful step.", icon: Sparkles },
  { id: "clinic-knowledge", title: "Clinic knowledge", detail: "Clinic profile facts and approved uploaded documents ground the answer.", icon: BookOpen },
  { id: "appointment-tools", title: "Appointment tools", detail: "Availability, booking, rescheduling, and cancellation use the existing clinic tools.", icon: Wrench },
  { id: "voice-response", title: "Voice response", detail: "The reply returns through the configured voice provider, with interruption support.", icon: AudioLines },
];
const languageOptions = [["en-IN", "English"], ["hi-IN", "Hindi"], ["ta-IN", "Tamil"], ["te-IN", "Telugu"], ["kn-IN", "Kannada"], ["ml-IN", "Malayalam"]] as const;

export function AssistantBuilder({ profile, onContinue, onSaved }: { profile: Record<string, string>; onContinue?: () => void; onSaved?: (assistant: Record<string, unknown>) => void }) {
  const [name, setName] = useState(profile.assistantName || "Clinic assistant");
  const [welcome, setWelcome] = useState(profile.assistantWelcome || "Hello, how can I help you today?");
  const [instructions, setInstructions] = useState(profile.assistantInstructions || "");
  const [languages, setLanguages] = useState<string[]>(profile.assistantLanguages ? profile.assistantLanguages.split(",").filter(Boolean) : ["en-IN", "hi-IN"]);
  const [nodeNotes, setNodeNotes] = useState<Record<string, string>>(() => {
    try { return profile.assistantNodeNotes ? JSON.parse(profile.assistantNodeNotes) as Record<string, string> : {}; }
    catch { return {}; }
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeStage, setActiveStage] = useState(0);
  const [question, setQuestion] = useState("Can I book an appointment this week?");
  const [reply, setReply] = useState("");
  const [testing, setTesting] = useState(false);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile._id) { setError("Save your clinic profile before configuring its assistant."); return; }
    if (!languages.length) { setError("Choose at least one language."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await api<{ assistant: Record<string, unknown> }>("/api/doctor/assistant", { method: "PATCH", body: JSON.stringify({ assistantName: name, assistantWelcome: welcome, assistantInstructions: instructions, assistantLanguages: languages, assistantNodeNotes: nodeNotes }) });
      onSaved?.(result.assistant);
      setNotice("Assistant configuration saved to your clinic.");
      onContinue?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save assistant settings."); }
    finally { setSaving(false); }
  };
  const test = async () => {
    if (!question.trim()) return;
    setTesting(true); setReply(""); setError("");
    try { const response = await api<{ reply: string }>("/api/assistant/chat", { method: "POST", body: JSON.stringify({ message: question.trim() }) }); setReply(response.reply); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Assistant test failed."); }
    finally { setTesting(false); }
  };

  return <div className="agent-builder">
    <header className="agent-builder-heading"><div><div className="date-kicker">YOUR CLINIC, IN CONVERSATION</div><h2>Shape your assistant</h2><p>Set its voice, clinic guidance, and the languages patients can use.</p></div><span className="agent-live-status"><i /> Clinic tools connected</span></header>
    <div className="agent-builder-grid">
      <form className="settings-card agent-config-form" onSubmit={(event) => void save(event)}>
        <div className="settings-card-heading"><div className="settings-form-icon"><Sparkles size={17} /></div><div><h2>Assistant identity</h2><span>These settings are used by your clinic's existing voice and chat agent.</span></div></div>
        <label>Assistant name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required /></label>
        <label>First welcome message<textarea value={welcome} onChange={(event) => setWelcome(event.target.value)} maxLength={240} rows={2} required /></label>
        <label>Clinic-specific guidance<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={1200} rows={4} placeholder="For example: explain how to prepare for a first consultation. Never add details that are not in the clinic profile or knowledge base." /><small>Use this for tone and clinic process. Safety rules and booking confirmations always remain in force.</small></label>
        <fieldset className="agent-language-list"><legend>Patient languages</legend>{languageOptions.map(([code, label]) => <label key={code}><input type="checkbox" checked={languages.includes(code)} onChange={() => setLanguages((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])} />{label}</label>)}</fieldset>
        {error && <div role="alert" className="error-banner">{error}</div>}{notice && <div role="status" className="notice"><Check size={15} />{notice}</div>}
        <div className="settings-card-footer"><span>Clinic-owned agent configuration</span><button className="button button-primary" disabled={saving || !profile._id}><Save size={15} />{saving ? "Saving…" : onContinue ? "Save and continue" : "Save assistant"}</button></div>
      </form>
      <section className="agent-flow-card">
        <div className="agent-flow-heading"><div><div className="editorial-kicker">LIVE WORKFLOW</div><h3>From question to care</h3></div><span><GitBranch size={14} /> Current clinic flow</span></div>
        <div className="agent-flow-list">{stages.map((stage, index) => { const Icon = stage.icon; return <button type="button" key={stage.title} className={`agent-flow-node ${activeStage === index ? "selected" : ""}`} onClick={() => setActiveStage(index)}><span className="agent-node-icon"><Icon size={15} /></span><span><b>{stage.title}</b><small>{activeStage === index ? stage.detail : index === 2 ? "Profile + approved knowledge" : index === 3 ? "Availability + booking actions" : "Select to inspect this step"}</small></span><span className="agent-node-number">0{index + 1}</span></button>; })}</div>
        <label className="agent-node-editor">Step guidance · {stages[activeStage]?.title}<textarea value={nodeNotes[stages[activeStage]?.id || ""] || ""} onChange={(event) => { const id = stages[activeStage]?.id; if (id) setNodeNotes((current) => ({ ...current, [id]: event.target.value })); }} maxLength={500} rows={2} placeholder="Optional clinic-specific guidance for this step" /><small>Saved with assistant settings and applied to the clinic agent.</small></label>
        <div className="agent-flow-branch"><span /><b>Clinic knowledge or appointment action</b><small>The assistant chooses the supported path from the patient's intent.</small></div>
        <div className="agent-test-panel"><div className="agent-test-heading"><span><Activity size={15} /> Test this clinic agent</span><span>Uses your configured backend tools</span></div><div className="agent-test-controls"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void test(); } }} aria-label="Test question" /><button type="button" className="button button-outline" onClick={() => void test()} disabled={testing || !profile._id}><Play size={14} />{testing ? "Running…" : "Run test"}</button></div>{reply && <div className="agent-test-reply"><span>{name}</span><p>{reply}</p></div>}<div className="agent-test-suggestions"><button type="button" onClick={() => setQuestion("What are the clinic hours?")}>Clinic hours</button><button type="button" onClick={() => setQuestion("I need an appointment this week")}>Book a visit</button></div></div>
      </section>
    </div>
  </div>;
}
