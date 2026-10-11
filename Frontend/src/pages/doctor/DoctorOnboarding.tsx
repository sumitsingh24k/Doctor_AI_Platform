import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, Circle } from "lucide-react";
import { DoctorSettings } from "./DoctorSettings";
import { KnowledgeBase } from "./KnowledgeBase";
import { AssistantBuilder } from "./AssistantBuilder";

const steps = ["Clinic profile", "Connect calendar", "Assistant setup", "Clinic knowledge"];

export function DoctorOnboarding({ doctorId, profile, email, saving, onSaveProfile, onConnectCalendar, calendarConnecting, onComplete, onAssistantSaved }: {
  doctorId: string; profile: Record<string, string>; email: string; saving: boolean;
  onSaveProfile: (event: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  onConnectCalendar: () => void; calendarConnecting: boolean; onComplete: () => Promise<boolean>;
  onAssistantSaved: (assistant: Record<string, unknown>) => void;
}) {
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [assistantConfigured, setAssistantConfigured] = useState(false);
  const [error, setError] = useState("");
  const initializedDoctorId = useRef("");
  useEffect(() => {
    if (!profile._id) { initializedDoctorId.current = ""; setStep(0); }
    else if (initializedDoctorId.current !== profile._id) {
      initializedDoctorId.current = profile._id;
      setStep(profile.calendarConnected === "true" ? 2 : 1);
    }
  }, [profile._id, profile.calendarConnected]);

  const finish = async () => {
    if (!doctorId || !profile._id || profile.calendarConnected !== "true" || !assistantConfigured) {
      setError("Save your clinic profile, connect Google Calendar, and configure your assistant to continue."); return;
    }
    setFinishing(true); setError("");
    try { if (!(await onComplete())) setError("Setup could not be saved. Please try again."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Setup could not be saved. Please try again."); }
    finally { setFinishing(false); }
  };

  return <div className="doctor-onboarding page-wrap">
    <header className="onboarding-header"><div className="date-kicker">PRACTICE SETUP</div><h1>Set up your clinic</h1><p>Four short steps to prepare your clinic, assistant, and booking flow.</p></header>
    <ol className="onboarding-progress" aria-label="Clinic setup steps">{steps.map((label, index) => <li className={index === step ? "active" : index < step ? "complete" : ""} key={label}><span>{index < step ? <Check size={15} /> : <Circle size={14} />}</span><b>{label}</b></li>)}</ol>
    {step === 0 && <DoctorSettings profile={profile} email={email} saving={saving} onSave={onSaveProfile} onConnectCalendar={onConnectCalendar} calendarConnecting={calendarConnecting} profileOnly onProfileSaved={() => setStep(1)} onAssistantSaved={onAssistantSaved} />}
    {step === 1 && <section className="settings-card onboarding-step-card"><div className="settings-card-heading"><div className="settings-form-icon"><CalendarDays size={18} /></div><div><h2>Connect your clinic calendar</h2><span>Check availability and add confirmed bookings to your schedule.</span></div></div><p className="onboarding-step-copy">Connect the Google Calendar used by this clinic. Google will ask you to approve access, then bring you back here. Calendar connection is required for online bookings.</p><div className="onboarding-step-actions"><button className="button button-outline" type="button" onClick={() => setStep(0)}>Back</button>{profile.calendarConnected === "true" ? <button className="button button-primary" type="button" onClick={() => setStep(2)}>Continue<ArrowRight size={15} /></button> : <button className="button button-primary" type="button" onClick={onConnectCalendar} disabled={calendarConnecting || !profile._id}>{calendarConnecting ? "Connecting…" : "Connect Google Calendar"}<ArrowRight size={15} /></button>}</div>{profile.calendarConnected === "true" && <div className="notice onboarding-connected"><Check size={16} />Google Calendar is connected.</div>}</section>}
    {step === 2 && <div className="onboarding-assistant-step"><AssistantBuilder profile={profile} onSaved={onAssistantSaved} onContinue={() => { setAssistantConfigured(true); setStep(3); }} /><div className="onboarding-step-actions"><button className="button button-outline" type="button" onClick={() => setStep(1)}>Back to calendar</button><span>Assistant settings can be changed any time from Settings.</span></div></div>}
    {step === 3 && <div className="onboarding-knowledge-step"><KnowledgeBase onContinue={() => void finish()} onboarding />{error && <div className="error-banner" role="alert">{error}</div>}<div className="onboarding-step-actions"><button className="button button-outline" type="button" onClick={() => setStep(2)} disabled={finishing}>Back to assistant</button><button className="button button-primary" type="button" onClick={() => void finish()} disabled={finishing || profile.calendarConnected !== "true" || !assistantConfigured}>{finishing ? "Opening your dashboard…" : "Finish setup"}<Check size={15} /></button><span>Adding clinic documents is optional. You can add or update them any time.</span></div></div>}
  </div>;
}
