import {
  ArrowRight, AudioLines, CalendarDays, HeartPulse, MapPin, MessageCircle, Mic, Navigation,
  Plus, ShieldCheck, Sparkles, Stethoscope,
} from "lucide-react";
import type { Appointment, Doctor, User } from "../../api";
import type { Section } from "../../types/app";
import { formatDate, formatToday } from "../../utils/format";
import { DoctorCard } from "../../components/patient/DoctorDirectory";

export function PatientHome({ user, appointments, setSection, requestLocation, locationMessage, doctors, onBook }: {
  user: User;
  appointments: Appointment[];
  setSection: (section: Section) => void;
  requestLocation: () => void;
  locationMessage: string;
  doctors: Doctor[];
  onBook: (doctor: Doctor) => void;
}) {
  const upcoming = appointments.filter((appointment) => appointment.status === "booked").slice(0, 2);
  return <div className="page-wrap">
    <div className="welcome-row"><div><div className="date-kicker">{formatToday()}</div><h1>Good to see you, {user.name.split(" ")[0]}<span className="wave">✦</span></h1><p>Let’s make taking care of you a little easier today.</p></div><button className="button button-primary" onClick={() => setSection("doctors")}><Plus size={17} />Find a doctor</button></div>
    <div className="patient-hero"><div className="hero-copy"><div className="hero-badge"><Sparkles size={14} />YOUR CARE, SIMPLIFIED</div><h2>Care that starts<br />with <em>a conversation.</em></h2><p>Tell your assistant what you need. It can help you find a nearby specialist and take the next step.</p><button className="button button-white" onClick={() => setSection("assistant")}><MessageCircle size={16} />Talk to your assistant<ArrowRight size={16} /></button><div className="hero-meta"><span><Mic size={13} /> Voice or chat</span><span><ShieldCheck size={13} /> Private by design</span></div></div><div className="hero-art"><div className="art-glow" /><div className="health-ring"><HeartPulse size={61} strokeWidth={1.25} /></div><div className="float-card float-left"><div className="float-card-icon"><MapPin size={15} /></div><span><b>Care, close by</b><small>Find specialists near you</small></span></div><div className="float-card float-right"><div className="float-card-icon purple"><AudioLines size={15} /></div><span><b>Just say the word</b><small>Talk to your assistant</small></span></div><div className="art-dot dot-one" /><div className="art-dot dot-two" /></div></div>
    <section className="section-block"><div className="section-heading"><div><h2>Care, your way</h2><p>Start wherever feels right.</p></div></div><div className="action-grid">
      <button className="action-card" onClick={() => setSection("doctors")}><div className="action-icon teal"><Stethoscope size={19} /></div><div><b>Find a specialist</b><span>Browse doctors and clinics</span></div><ArrowRight size={17} /></button>
      <button className="action-card" onClick={requestLocation}><div className="action-icon violet"><Navigation size={19} /></div><div><b>Find care nearby</b><span>{locationMessage || "Use your location to sort nearby doctors"}</span></div><ArrowRight size={17} /></button>
      <button className="action-card" onClick={() => setSection("assistant")}><div className="action-icon blue"><Mic size={19} /></div><div><b>Ask your assistant</b><span>Get help by voice or chat</span></div><ArrowRight size={17} /></button>
    </div></section>
    <section className="section-block"><div className="section-heading"><div><h2>{upcoming.length ? "Your upcoming care" : "Doctors near you"}</h2><p>{upcoming.length ? "Your next steps, all in one place." : "Thoughtful care is closer than you think."}</p></div><button className="text-link" onClick={() => setSection(upcoming.length ? "appointments" : "doctors")}>{upcoming.length ? "View appointments" : "Browse all doctors"}<ArrowRight size={15} /></button></div>
      {upcoming.length ? <div className="upcoming-grid">{upcoming.map((item) => <div className="appointment-card" key={item._id}><div className="appointment-date-icon"><CalendarDays size={19} /></div><div className="appointment-info"><span className="status-chip"><i />Confirmed</span><b>{item.patientName}</b><span>{formatDate(item.appointmentDate)} · {item.appointmentTime}</span></div><ArrowRight className="muted-arrow" size={17} /></div>)}</div>
        : doctors.length ? <div className="doctor-row-cards">{doctors.slice(0, 2).map((doctor) => <DoctorCard key={doctor._id} doctor={doctor} onBook={onBook} compact />)}</div>
          : <button className="location-banner" onClick={requestLocation}><div><div className="action-icon teal"><MapPin size={19} /></div><span><b>Discover care around you</b><small>Share your location to see nearby specialists.</small></span></div><span className="button button-primary button-small">Enable location</span></button>}
    </section>
    <div className="privacy-strip"><ShieldCheck size={17} /><span><b>Your health information stays yours.</b> Medimind only uses your location when you choose to share it.</span><button onClick={() => setSection("assistant")}>Learn more<ArrowRight size={14} /></button></div>
  </div>;
}
