import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { api, type Appointment } from "../../api";

type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
};

function getWeekDays(weekOffset: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + index + weekOffset * 7);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

export function DoctorCalendar({ appointments, doctorId, connected }: {
  appointments: Appointment[];
  doctorId?: string;
  connected: boolean;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [googleError, setGoogleError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const days = getWeekDays(weekOffset);

  useEffect(() => {
    if (!connected || !doctorId || !days.length) {
      setGoogleEvents([]);
      setGoogleError("");
      return;
    }
    let active = true;
    setGoogleLoading(true);
    setGoogleError("");
    const params = new URLSearchParams({
      start: days[0].toISOString(),
      end: new Date(days[6].getTime() + 86400000).toISOString(),
    });
    api<{ events: CalendarEvent[] }>(`/api/google-calendar/doctors/${doctorId}/events?${params}`)
      .then(({ events }) => {
        if (active) setGoogleEvents(events);
      })
      .catch((reason: unknown) => {
        if (active) setGoogleError(reason instanceof Error ? reason.message : "Unable to load Google Calendar events.");
      })
      .finally(() => {
        if (active) setGoogleLoading(false);
      });
    return () => { active = false; };
  }, [weekOffset, doctorId, connected]);

  return <div className="page-wrap"><div className="page-title-row"><div><div className="date-kicker">PRACTICE SCHEDULE</div><h1>Calendar</h1><p>Manage visits and keep your clinic moving.</p></div><div className="calendar-toolbar"><span className={`sync-chip ${connected ? "" : "calendar-disconnected"}`}><CheckCircle2 size={14} />{connected ? "Google Calendar synced" : "Google Calendar not connected"}</span><button className="icon-button" onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week"><ArrowLeft size={16} /></button><button className="icon-button" onClick={() => setWeekOffset((value) => value + 1)} aria-label="Next week"><ArrowRight size={16} /></button></div></div>
    {googleError && <div className="calendar-load-error" role="alert">{googleError} Check the Google Calendar connection in Settings and try again.</div>}
    <div className="calendar-legend"><span className="legend-clinic" /> Medimind appointment <span className="legend-google" /> Google Calendar event {googleLoading && <span className="calendar-loading">Syncing events…</span>}</div>
    <div className="calendar-card"><div className="calendar-head"><div className="time-cell">TIME</div>{days.map((day) => <div className={`day-cell ${day.toDateString() === new Date().toDateString() ? "today-column" : ""}`} key={day.toISOString()}><span>{day.toLocaleDateString("en", { weekday: "short" })}</span><b>{day.getDate()}</b></div>)}</div>{Array.from({ length: 10 }, (_, hourIndex) => hourIndex + 8).map((hour) => <div className="calendar-row" key={hour}><div className="time-cell">{hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}</div>{days.map((day) => {
      const appointment = appointments.find((item) => new Date(item.appointmentDate).toDateString() === day.toDateString() && Number.parseInt(item.appointmentTime, 10) === hour && item.status === "booked");
      const googleEvent = googleEvents.find((event) => {
        if (event.allDay || !event.start) return false;
        const eventDate = new Date(event.start);
        return eventDate.toDateString() === day.toDateString() && eventDate.getHours() === hour &&
          !appointments.some((item) => item.status === "booked" && new Date(item.appointmentDate).toDateString() === day.toDateString() && Number.parseInt(item.appointmentTime, 10) === hour);
      });
      return <div className="calendar-slot" key={`${day.toISOString()}-${hour}`}>
        {appointment && <div className="calendar-event"><b>{appointment.patientName}</b><span>{appointment.appointmentTime}</span><small>{appointment.visitType === "follow-up" ? "Follow-up" : "Consultation"}</small></div>}
        {!appointment && googleEvent && <div className="calendar-event google-calendar-event"><b>{googleEvent.summary}</b><span>{new Date(googleEvent.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><small>Google Calendar</small></div>}
      </div>;
    })}</div>)}</div>
    {!connected && <div className="calendar-connect-hint">Connect Google Calendar in <b>Settings</b> to show existing clinic events and check availability against your schedule.</div>}
  </div>;
}
