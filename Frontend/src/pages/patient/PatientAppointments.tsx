import { CalendarDays, Video } from "lucide-react";
import type { Appointment } from "../../api";
import type { Section } from "../../types/app";
import { formatDate } from "../../utils/format";

export function PatientAppointments({ appointments, loading, setSection }: {
  appointments: Appointment[];
  loading: boolean;
  setSection: (section: Section) => void;
}) {
  const upcoming = appointments.filter((item) => item.status === "booked");
  const past = appointments.filter((item) => item.status !== "booked");
  return <div className="page-wrap"><div className="page-title-row"><div><div className="date-kicker">YOUR CARE PLAN</div><h1>My appointments</h1><p>Keep track of your upcoming visits and care history.</p></div><span className="appointment-total">{appointments.length} total</span></div>
    {loading ? <div className="empty-state"><p>Loading your appointments…</p></div> : upcoming.length ? <section className="section-block appointments-section"><div className="section-heading"><div><h2>Upcoming</h2><p>Your confirmed visits.</p></div></div><div className="patient-appointment-list">{upcoming.map((item) => <div className="patient-appointment" key={item._id}><div className="date-tile"><b>{new Date(item.appointmentDate).getDate()}</b><span>{new Date(item.appointmentDate).toLocaleDateString("en", { month: "short" })}</span></div><div className="appointment-info"><span className="status-chip">Confirmed</span><b>Appointment with your doctor</b><span>{formatDate(item.appointmentDate)} at {item.appointmentTime} · {item.patientName}</span></div><Video size={19} className="muted-arrow" /></div>)}</div></section>
      : <div className="empty-state appointment-empty"><div className="empty-icon"><CalendarDays size={22} /></div><h3>No appointments yet</h3><p>Find a doctor and choose a time that works for you.</p><button className="button button-primary button-small" onClick={() => setSection("doctors")}>Explore doctors</button></div>}
    {past.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Past visits</h2><p>Your completed and cancelled appointments.</p></div></div><div className="patient-appointment-list">{past.map((item) => <div className="patient-appointment" key={item._id}><div className="date-tile muted-tile"><b>{new Date(item.appointmentDate).getDate()}</b><span>{new Date(item.appointmentDate).toLocaleDateString("en", { month: "short" })}</span></div><div className="appointment-info"><span className="status-chip muted-chip"><i />{item.status}</span><b>Appointment with your doctor</b><span>{formatDate(item.appointmentDate)} at {item.appointmentTime}</span></div></div>)}</div></section>}
  </div>;
}
