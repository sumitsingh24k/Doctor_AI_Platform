import {
  Activity, ArrowRight, CalendarDays, Clock3, Plus, Settings, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import type { Appointment, User } from "../../api";
import type { Section } from "../../types/app";
import { formatToday, initials } from "../../utils/format";

function Metric({ icon: Icon, label, value, trend, tone }: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  trend: string;
  tone: string;
}) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-trend">{trend}</div></div>;
}

export function DoctorDashboard({ user, appointments, setSection }: {
  user: User;
  appointments: Appointment[];
  setSection: (section: Section) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const todays = appointments.filter((item) => new Date(item.appointmentDate).toISOString().slice(0, 10) === today && item.status === "booked");
  const upcoming = appointments.filter((item) => item.status === "booked").slice(0, 4);
  return <div className="page-wrap doctor-dashboard"><div className="welcome-row"><div><div className="date-kicker">{formatToday()}</div><h1>Good morning, Dr. {user.name.split(" ").slice(-1)[0]}</h1><p>Here’s what’s happening at your practice today.</p></div><div className="doctor-actions"><button className="button button-outline" onClick={() => setSection("knowledge")}><Plus size={16} />Upload documents</button><button className="button button-primary" onClick={() => setSection("calendar")}><CalendarDays size={16} />Appointments</button></div></div>
    <div className="metric-grid"><Metric icon={CalendarDays} label="Today's appointments" value={String(todays.length)} trend="Your schedule today" tone="teal" /><Metric icon={Sparkles} label="AI-assisted bookings" value="—" trend="Connect assistant activity" tone="violet" /><Metric icon={Users} label="Active patients" value={String(new Set(appointments.map((item) => item.patientName)).size)} trend="Based on appointment records" tone="blue" /><Metric icon={Clock3} label="Appointments booked" value={String(appointments.length)} trend="All clinic appointments" tone="amber" /></div>
    <div className="dashboard-columns"><section className="panel schedule-panel"><div className="panel-heading"><div><h2>Today's schedule</h2><span>Upcoming clinic appointments</span></div><button className="text-link" onClick={() => setSection("calendar")}>Open calendar<ArrowRight size={14} /></button></div>{upcoming.length ? <div className="schedule-list">{upcoming.map((item) => <div className="schedule-item" key={item._id}><span className="schedule-time">{item.appointmentTime}</span><div className="schedule-person"><div className="patient-mini-avatar">{initials(item.patientName)}</div><span><b>{item.patientName}</b><small>{item.visitType === "follow-up" ? "Follow-up visit" : "New consultation"}</small></span></div><span className="status-chip"><i />{item.status}</span></div>)}</div> : <div className="panel-empty"><CalendarDays size={20} /><span>No appointments to show yet.</span></div>}</section><section className="panel bookings-panel"><div className="panel-heading"><div><h2>Practice snapshot</h2><span>At a glance</span></div><div className="snapshot-icon"><Activity size={16} /></div></div><div className="snapshot-number">{appointments.length}<small>appointment records</small></div><div className="snapshot-progress"><span style={{ width: `${appointments.length ? Math.min(100, 25 + appointments.length * 4) : 6}%` }} /></div><div className="snapshot-foot"><span>Patient care, organized</span><span><ShieldCheck size={13} />Live data</span></div></section></div>
    <div className="doctor-setup-callout"><div className="setup-icon"><Settings size={19} /></div><span><b>Make your clinic easy to find</b><small>Add your clinic hours and location coordinates in settings so nearby patients can discover your practice.</small></span><button className="button button-outline button-small" onClick={() => setSection("settings")}>Complete profile<ArrowRight size={14} /></button></div>
  </div>;
}
