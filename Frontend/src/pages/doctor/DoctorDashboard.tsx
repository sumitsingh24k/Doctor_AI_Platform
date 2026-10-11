import { ArrowRight, CalendarDays, Check, Circle, FileText, Settings } from "lucide-react";
import type { Appointment, User } from "../../api";
import type { Section } from "../../types/app";
import { formatDate, formatToday } from "../../utils/format";

export function DoctorDashboard({ user, appointments, appointmentsLoading, profile, setSection }: {
  user: User;
  appointments: Appointment[];
  appointmentsLoading: boolean;
  profile: Record<string, string>;
  setSection: (section: Section) => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const upcoming = appointments
    .filter((item) => item.status === "booked" && String(item.appointmentDate).slice(0, 10) >= today)
    .sort((left, right) => new Date(left.appointmentDate).getTime() - new Date(right.appointmentDate).getTime() || left.appointmentTime.localeCompare(right.appointmentTime))
    .slice(0, 6);
  const todayAppointments = upcoming.filter((item) => String(item.appointmentDate).slice(0, 10) === today);
  const profileComplete = Boolean(profile._id);
  const calendarConnected = profile.calendarConnected === "true";

  return <div className="page-wrap doctor-dashboard">
    <div className="page-title-row">
      <div><div className="date-kicker">{formatToday()}</div><h1>Welcome, {user.name}</h1><p>Your practice overview and next steps.</p></div>
      <button className="button button-primary" onClick={() => setSection("calendar")}>Open calendar<ArrowRight size={15} /></button>
    </div>

    <section className="dashboard-summary" aria-label="Appointment summary">
      <div><span>Today</span><b>{todayAppointments.length}</b><small>appointments</small></div>
      <div><span>Booked</span><b>{appointments.filter((item) => item.status === "booked").length}</b><small>confirmed appointment records</small></div>
      <div><span>All records</span><b>{appointments.length}</b><small>appointment records</small></div>
    </section>

    <div className="dashboard-columns">
      <section className="panel schedule-panel">
        <div className="panel-heading"><div><h2>Today’s appointments</h2><span>{formatToday()}</span></div><button className="text-link" onClick={() => setSection("calendar")}>View calendar<ArrowRight size={14} /></button></div>
        {appointmentsLoading ? <div className="panel-empty">Loading appointments…</div> : todayAppointments.length ? <div className="schedule-list">{todayAppointments.map((item) => <div className="schedule-item" key={item._id}><span className="schedule-time">{item.appointmentTime}</span><div className="schedule-person"><span><b>{item.patientName}</b><small>{item.visitType === "follow-up" ? "Follow-up visit" : "New consultation"}</small></span></div><span className="status-chip">{item.status}</span></div>)}</div> : <div className="panel-empty"><span>No appointments scheduled for today.</span><button className="text-link" onClick={() => setSection("calendar")}>See upcoming appointments<ArrowRight size={14} /></button></div>}
      </section>

      <section className="panel onboarding-panel">
        <div className="panel-heading"><div><h2>Practice tools</h2><span>Configure the tools patients use to reach your clinic.</span></div></div>
        <ol className="onboarding-list">
          <li className={profileComplete ? "step-complete" : ""}><span className="step-mark">{profileComplete ? <Check size={14} /> : <Circle size={14} />}</span><span><b>Create clinic profile</b><small>Doctor information, clinic details, and hours.</small></span><button className="text-link" onClick={() => setSection("settings")}>{profileComplete ? "Review" : "Set up"}<ArrowRight size={14} /></button></li>
          <li className={calendarConnected ? "step-complete" : ""}><span className="step-mark">{calendarConnected ? <Check size={14} /> : <Circle size={14} />}</span><span><b>Connect Google Calendar</b><small>Check availability and add bookings to your calendar.</small></span><button className="text-link" onClick={() => setSection("settings")}>{calendarConnected ? "Connected" : "Connect"}<ArrowRight size={14} /></button></li>
          <li><span className="step-mark"><FileText size={14} /></span><span><b>Add clinic knowledge</b><small>Upload documents about services, fees, and policies.</small></span><button className="text-link" onClick={() => setSection("knowledge")}>Open<ArrowRight size={14} /></button></li>
          <li className={Boolean(profile.assistantName) ? "step-complete" : ""}><span className="step-mark"><Settings size={14} /></span><span><b>Configure your assistant</b><small>{profile.assistantName || "Set its welcome, clinic guidance, and languages."}</small></span><button className="text-link" onClick={() => setSection("settings")}>Configure<ArrowRight size={14} /></button></li>
          <li><span className="step-mark"><CalendarDays size={14} /></span><span><b>Test a voice conversation</b><small>Try a patient question with your live clinic agent.</small></span><button className="text-link" onClick={() => setSection("assistant")}>Open playground<ArrowRight size={14} /></button></li>
        </ol>
      </section>
    </div>

    <section className="panel upcoming-panel">
      <div className="panel-heading"><div><h2>Next appointments</h2><span>Upcoming confirmed visits</span></div><button className="text-link" onClick={() => setSection("calendar")}>Open calendar<ArrowRight size={14} /></button></div>
      {appointmentsLoading ? <div className="panel-empty">Loading appointments…</div> : upcoming.length ? <div className="schedule-list">{upcoming.map((item) => <div className="schedule-item" key={item._id}><span className="schedule-time">{item.appointmentTime}</span><div className="schedule-person"><span><b>{item.patientName}</b><small>{formatDate(item.appointmentDate)}</small></span></div><span className="status-chip">{item.status}</span></div>)}</div> : <div className="panel-empty"><CalendarDays size={17} /><span>No upcoming appointments. New bookings will appear here.</span></div>}
    </section>
  </div>;
}
