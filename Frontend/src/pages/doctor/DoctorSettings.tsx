import { ArrowRight, CalendarDays, Check, Mic, MapPin, ShieldCheck, Stethoscope } from "lucide-react";

export function DoctorSettings({ profile, saving, onSave, onConnectCalendar, calendarConnecting }: {
  profile: Record<string, string>;
  saving: boolean;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onConnectCalendar: () => void;
  calendarConnecting: boolean;
}) {
  const connected = profile.calendarConnected === "true";
  return <div className="page-wrap settings-page"><div className="page-title-row"><div><div className="date-kicker">YOUR PRACTICE</div><h1>Settings</h1><p>Keep your clinic details and appointment preferences up to date.</p></div></div>
    <form className="settings-card" onSubmit={onSave}>
      <div className="settings-card-heading"><div className="settings-form-icon"><Stethoscope size={17} /></div><div><h2>Clinic profile</h2><span>Shown to patients looking for a specialist.</span></div></div>
      <div className="settings-fields">
        <label>Doctor name<input name="name" defaultValue={profile.name} placeholder="Dr. Kavya Menon" required /></label>
        <label>Clinic name<input name="clinicName" defaultValue={profile.clinicName} placeholder="Your clinic" required /></label>
        <label>Specialization<input name="specialization" defaultValue={profile.specialization} placeholder="Cardiology" required /></label>
        <label>Qualification<input name="qualification" defaultValue={profile.qualification} placeholder="MBBS, MD" required /></label>
        <label className="span-two">Clinic address<input name="clinicAddress" defaultValue={profile.clinicAddress} placeholder="Street, city, postal code" required /></label>
        <label className="span-two">About your practice<textarea name="aboutDoctor" defaultValue={profile.aboutDoctor} placeholder="Tell patients about your clinic and approach…" rows={3} required /></label>
        <label>Opening time<input name="clinicOpeningTime" defaultValue={profile.clinicOpeningTime} placeholder="09:00 AM" required /></label>
        <label>Closing time<input name="clinicClosingTime" defaultValue={profile.clinicClosingTime} placeholder="05:00 PM" required /></label>
        <label>Appointment length (minutes)<input name="appointmentDurationMinutes" type="number" min="5" max="240" defaultValue={profile.appointmentDurationMinutes || "30"} required /></label>
        <div className="coordinate-fields"><div className="coordinate-label"><MapPin size={14} />Clinic coordinates <span>for nearby doctor search</span></div><div><input name="clinicLatitude" type="number" step="any" defaultValue={profile.clinicLatitude} placeholder="Latitude" aria-label="Clinic latitude" /><input name="clinicLongitude" type="number" step="any" defaultValue={profile.clinicLongitude} placeholder="Longitude" aria-label="Clinic longitude" /></div><small>Find coordinates in a map app and paste them here. Patients will only see approximate distance.</small></div>
      </div>
      <div className="settings-card-footer"><span><ShieldCheck size={15} />Your private clinic settings</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}<Check size={15} /></button></div>
    </form>
    <div className="integration-grid">
      <div className="integration-card"><div className="integration-icon"><CalendarDays size={18} /></div><b>Google Calendar</b><span>Existing clinic events are shown in Calendar. New Medimind bookings are added to this Google Calendar.</span><div className="integration-status">{connected ? <><i />Connected to your clinic calendar</> : profile._id ? <span>Not connected yet</span> : <span>Save clinic profile first</span>}</div>{profile._id && <button className={`button ${connected ? "button-outline" : "button-primary"} calendar-connect-button`} type="button" onClick={onConnectCalendar} disabled={calendarConnecting}>{calendarConnecting ? "Connecting…" : connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}<ArrowRight size={14} /></button>}</div>
      <div className="integration-card"><div className="integration-icon purple-icon"><Mic size={18} /></div><b>Voice assistant</b><span>Help patients discover your clinic by voice.</span><div className="integration-status">Sarvam AI connection is managed by your backend</div></div>
    </div>
  </div>;
}
