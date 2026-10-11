import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Check, Mic, MapPin, Stethoscope } from "lucide-react";
import { AssistantBuilder } from "./AssistantBuilder";

const toTimeInputValue = (value: string | undefined) => {
  if (!value) return "";
  const time = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!time) return "";
  let hours = Number(time[1]);
  if (time[3]) {
    const isPm = time[3].toUpperCase() === "PM";
    hours = (hours % 12) + (isPm ? 12 : 0);
  }
  return `${String(hours).padStart(2, "0")}:${time[2]}`;
};

export function DoctorSettings({ profile, email, saving, onSave, onConnectCalendar, calendarConnecting, profileOnly = false, onProfileSaved, onAssistantSaved }: {
  profile: Record<string, string>;
  email: string;
  saving: boolean;
  onSave: (event: React.FormEvent<HTMLFormElement>) => Promise<boolean> | boolean | void;
  onConnectCalendar: () => void;
  calendarConnecting: boolean;
  profileOnly?: boolean;
  onProfileSaved?: () => void;
  onAssistantSaved?: (assistant: Record<string, unknown>) => void;
}) {
  const connected = profile.calendarConnected === "true";
  const [coordinates, setCoordinates] = useState({ latitude: profile.clinicLatitude || "", longitude: profile.clinicLongitude || "" });
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    setCoordinates({ latitude: profile.clinicLatitude || "", longitude: profile.clinicLongitude || "" });
  }, [profile.clinicLatitude, profile.clinicLongitude]);

  const useMyLocation = () => {
    setLocationMessage("");
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser. Enter your city or area instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: position }) => {
        setCoordinates({ latitude: String(position.latitude), longitude: String(position.longitude) });
        setLocationMessage("Your current location will be used to sort nearby clinics.");
        setLocating(false);
      },
      () => {
        setLocationMessage("Location permission was not granted. You can still enter your city or area.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const submitProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    const saved = await onSave(event);
    if (profileOnly && saved) onProfileSaved?.();
  };

  return <div className="page-wrap settings-page">{!profileOnly && <div className="page-title-row"><div><div className="date-kicker">YOUR PRACTICE</div><h1>Settings</h1><p>Keep your clinic details and appointment preferences up to date.</p></div></div>}
    <form key={profile._id || "new-clinic"} className="settings-card" onSubmit={(event) => void submitProfile(event)}>
      <div className="settings-card-heading"><div className="settings-form-icon"><Stethoscope size={17} /></div><div><h2>Clinic profile</h2><span>Shown to patients looking for a specialist.</span></div></div>
      <input type="hidden" name="aboutDoctor" value={profile.aboutDoctor || "No additional practice information provided."} />
      <div className="settings-fields">
        <label>Doctor name<input name="name" defaultValue={profile.name} placeholder="Dr. Kavya Menon" required /></label>
        <label>Clinic name<input name="clinicName" defaultValue={profile.clinicName} placeholder="Your clinic" required /></label>
        <label>Specialization<input name="specialization" defaultValue={profile.specialization} placeholder="Cardiology" required /></label>
        <label>Qualification<input name="qualification" defaultValue={profile.qualification} placeholder="MBBS, MD" required /></label>
        <label className="span-two">Clinic location<input name="clinicAddress" defaultValue={profile.clinicAddress} placeholder="Mumbai, Bandra West or full clinic address" required /><small>Enter a city or area, such as Mumbai, or your clinic’s full address.</small></label>
        <label>Opening time<input name="clinicOpeningTime" type="time" defaultValue={toTimeInputValue(profile.clinicOpeningTime) || "09:00"} required /></label>
        <label>Closing time<input name="clinicClosingTime" type="time" defaultValue={toTimeInputValue(profile.clinicClosingTime) || "17:00"} required /></label>
        <label>Appointment length (minutes)<input name="appointmentDurationMinutes" type="number" min="5" max="240" defaultValue={profile.appointmentDurationMinutes || "30"} required /></label>
        <label>Clinic time zone<input name="clinicTimeZone" defaultValue={profile.clinicTimeZone || "Asia/Kolkata"} placeholder="Asia/Kolkata" required /></label>
        <div className="location-picker"><div><b>Nearby clinic search</b><small>Use your device location to help patients find clinics near them.</small></div><input type="hidden" name="clinicLatitude" value={coordinates.latitude} /><input type="hidden" name="clinicLongitude" value={coordinates.longitude} /><button className="button button-outline" type="button" onClick={useMyLocation} disabled={locating}><MapPin size={15} />{locating ? "Finding location…" : coordinates.latitude && coordinates.longitude ? "Update my location" : "Use my location"}</button>{locationMessage && <small className="location-picker-message" role="status">{locationMessage}</small>}</div>
      </div>
      <div className="settings-card-footer"><span>{profileOnly ? "Step 1 of 4" : "Patient-facing clinic profile"}</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : profileOnly ? "Save and continue" : "Save changes"}<Check size={15} /></button></div>
    </form>
    {!profileOnly && <><div className="integration-grid">
      <div className="integration-card"><div className="integration-icon"><CalendarDays size={18} /></div><b>Google Calendar</b><span>Existing clinic events are shown in Calendar. New Medimind bookings are added to this Google Calendar.</span><div className="integration-status">{connected ? <><i />Connected to your clinic calendar</> : profile._id ? <span>Not connected yet</span> : <span>Save clinic profile first</span>}</div>{profile._id && <button className={`button ${connected ? "button-outline" : "button-primary"} calendar-connect-button`} type="button" onClick={onConnectCalendar} disabled={calendarConnecting}>{calendarConnecting ? "Connecting…" : connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}<ArrowRight size={14} /></button>}</div>
      <div className="integration-card"><div className="integration-icon purple-icon"><Mic size={18} /></div><b>Voice assistant</b><span>Help patients discover your clinic by voice.</span><div className="integration-status">Sarvam AI connection is managed by your backend</div></div>
    </div>

    <AssistantBuilder profile={profile} onSaved={onAssistantSaved} />

    <section className="settings-card account-settings">
      <div className="settings-card-heading"><div><h2>Account</h2><span>Account currently signed in to this practice.</span></div></div>
      <dl><div><dt>Email</dt><dd>{email}</dd></div><div><dt>Account type</dt><dd>Doctor</dd></div></dl>
    </section></>}
  </div>;
}
