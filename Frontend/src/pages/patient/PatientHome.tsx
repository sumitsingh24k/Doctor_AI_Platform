import { ArrowDownRight, ArrowRight, AudioLines, CalendarDays, MapPin, Mic, ShieldCheck, Stethoscope, BookOpen, CalendarCheck, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Appointment, Doctor } from "../../api";
import type { Section } from "../../types/app";
import { formatDate, initials } from "../../utils/format";
import type { useAssistant } from "../../hooks/useAssistant";

export function PatientHome({ appointments, appointmentsLoading, setSection, doctors, doctorsLoading, assistant }: {
  appointments: Appointment[]; appointmentsLoading: boolean; setSection: (section: Section) => void;
  doctors: Doctor[]; doctorsLoading: boolean; assistant: ReturnType<typeof useAssistant>;
}) {
  const [feature, setFeature] = useState(0);
  const [workflowStep, setWorkflowStep] = useState(0);
  const features = [
    { label: "Voice receptionist", title: "A calmer first conversation.", copy: "Patients can ask about your clinic, find the right next step, and speak naturally in supported Indian languages.", cta: "Try the voice assistant", destination: "assistant" as const, steps: ["Patient speaks", "Clinic context", "Helpful response"], icons: [Mic, BookOpen, AudioLines] },
    { label: "Doctor discovery", title: "Find care that feels close.", copy: "Explore real clinic profiles, compare specialties, and start a direct conversation without creating a patient account.", cta: "Browse the directory", destination: "doctors" as const, steps: ["Choose a specialty", "Meet the doctor", "Ask a question"], icons: [Search, Stethoscope, Sparkles] },
    { label: "Appointment flow", title: "From question to confirmed visit.", copy: "Check live clinic availability and follow the supported booking flow with the clinic's connected calendar.", cta: "Find an appointment", destination: "doctors" as const, steps: ["Check availability", "Choose a time", "Confirm the visit"], icons: [Search, CalendarDays, CalendarCheck] },
  ];
  const activeFeature = features[feature];
  const today = new Date().toLocaleDateString("en-CA");
  const upcoming = appointments.filter((item) => item.status === "booked" && String(item.appointmentDate).slice(0, 10) >= today)
    .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()).slice(0, 2);
  const talk = (doctor?: Doctor) => { if (doctor) assistant.openVoiceConversation(doctor); setSection("assistant"); };

  return <div className="public-home">
    <section className="public-hero">
      <div className="hero-copy">
        <div className="hero-eyebrow"><span className="live-dot" /> CARE THAT SPEAKS YOUR LANGUAGE <span className="hero-devanagari">आपकी भाषा में</span></div>
        <h1>Good care begins<br />with <em>a conversation.</em></h1>
        <p>Find a doctor, understand your options, and book a visit. Your clinic’s AI receptionist is ready in Hindi or English.</p>
        <div className="hero-actions"><button className="button button-primary" onClick={() => setSection("doctors")}>Find a doctor <ArrowRight size={16} /></button><button className="hero-text-link" onClick={() => talk()}>Talk to the care assistant <ArrowDownRight size={16} /></button></div>
        <div className="hero-assurance"><ShieldCheck size={15} /><span>Private by design</span><i /> <span>No patient account needed</span></div>
      </div>
      <div className="hero-voice-panel">
        <div className="voice-panel-top"><span><i className="live-dot" /> RECEPTION, REIMAGINED</span><span className="voice-language">HI · EN</span></div>
        <div className="voice-visual" aria-hidden="true"><div className="voice-arc arc-outer"/><div className="voice-arc arc-inner"/><div className="voice-disc"><AudioLines size={32} strokeWidth={1.45}/></div><span className="voice-note note-one">नमस्ते</span><span className="voice-note note-two">hello</span></div>
        <div className="voice-panel-caption"><div><b>“I’d like to see a doctor this week.”</b><span>Speak naturally. We’ll help with the next step.</span></div><button className="voice-play" aria-label="Start a conversation" onClick={() => talk()}><Mic size={19}/></button></div>
        <button className="voice-open-link" onClick={() => talk()}>Try the voice assistant <ArrowRight size={14}/></button>
      </div>
      <div className="hero-index">01 <span>—</span> CARE, WITHOUT THE FRICTION</div>
    </section>

    <section className="public-product-showcase" aria-label="How Medimind works">
      <div className="showcase-header"><div><div className="editorial-kicker">CARE, CONNECTED</div><h2>One thoughtful way<br/>to <em>find your next step.</em></h2></div><p>Designed around the way people ask for care: in their own words, at their own pace.</p></div>
      <div className="showcase-tabs" role="tablist" aria-label="Explore the care experience">{features.map((item, index) => <button type="button" role="tab" aria-selected={feature === index} className={feature === index ? "active" : ""} key={item.label} onClick={() => { setFeature(index); setWorkflowStep(0); }}>{item.label}<ArrowRight size={13}/></button>)}</div>
      <div className="showcase-stage" role="tabpanel"><div className="showcase-copy"><span className="showcase-index">0{feature + 1} / 03</span><h3>{activeFeature.title}</h3><p>{activeFeature.copy}</p><button className="button button-primary" onClick={() => setSection(activeFeature.destination)}>{activeFeature.cta}<ArrowRight size={15}/></button></div><div className="showcase-flow" aria-label="Interactive care workflow">{activeFeature.steps.map((label, index) => { const Icon = activeFeature.icons[index]; return <div className="showcase-flow-item" key={label}><button type="button" aria-pressed={workflowStep === index} className={workflowStep === index ? "selected" : ""} onClick={() => setWorkflowStep(index)}><span><Icon size={17}/></span><b>{label}</b><small>{index === workflowStep ? ["Start with a natural question.", "Grounded in real clinic information.", "Continue to the patient’s chosen next step."][index] : "Select to explore this step"}</small></button>{index < 2 && <i className="showcase-connector"/>}</div>; })}</div></div>
    </section>

    <section className="public-section discover-section">
      <div className="section-intro"><div><div className="editorial-kicker">A GOOD PLACE TO START</div><h2>Meet your local<br/><em>care team.</em></h2></div><button className="section-arrow" onClick={() => setSection("doctors")}>Browse all doctors <ArrowRight size={16}/></button></div>
      {doctorsLoading ? <div className="public-doctor-grid"><div className="public-doctor-skeleton"/><div className="public-doctor-skeleton"/></div> : doctors.length ? <div className="public-doctor-grid">{doctors.slice(0, 2).map((doctor, index) => <article className="public-doctor-card" key={doctor._id}><div className={`doctor-portrait portrait-${index + 1}`}><span>{initials(doctor.name)}</span><span className="portrait-cross"><Stethoscope size={19}/></span></div><div className="public-doctor-meta"><span className="doctor-index">0{index + 1} / {doctor.specialization || "GENERAL PRACTICE"}</span><h3>{doctor.name}</h3><p>{doctor.qualification}</p><div className="public-clinic-line"><MapPin size={14}/>{doctor.clinicName}{doctor.clinicAddress ? <span> · {doctor.clinicAddress}</span> : null}</div><button className="doctor-visit-link" onClick={() => setSection("doctors")}>View profile & availability <ArrowRight size={14}/></button></div></article>)}</div> : <div className="public-empty"><Stethoscope size={20}/><span>{doctorsLoading ? "Finding clinics near you…" : "Our directory is growing. Check back soon."}</span><button onClick={() => setSection("doctors")}>Explore directory <ArrowRight size={14}/></button></div>}
      <div className="care-note"><span className="care-note-mark">✳</span><span>Every practice is different. Browse clinic profiles to find the right fit for you.</span></div>
    </section>
    {upcoming.length > 0 && <section className="public-section public-upcoming"><div className="section-intro"><div><div className="editorial-kicker">YOUR CARE</div><h2>Coming up.</h2></div><button className="section-arrow" onClick={() => setSection("appointments")}>All appointments <ArrowRight size={16}/></button></div>{appointmentsLoading ? <div>Loading visits…</div> : upcoming.map((item) => <div className="patient-appointment" key={item._id}><CalendarDays size={18}/><div className="appointment-info"><b>Clinic appointment</b><span>{formatDate(item.appointmentDate)} at {item.appointmentTime}</span></div><span className="status-chip">Confirmed</span></div>)}</section>}
    <footer className="public-footer"><span>medimind <i>✳</i></span><span>Thoughtful care, made more accessible.</span><button onClick={() => talk()}>Need a hand? Talk to us <ArrowRight size={14}/></button></footer>
  </div>;
}
