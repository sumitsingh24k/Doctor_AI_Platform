import { ArrowRight, CalendarDays, CheckCircle2, ShieldCheck, X } from "lucide-react";
import type { Doctor } from "../../api";
import type { Availability } from "../../types/app";
import { initials } from "../../utils/format";

export function BookingModal({
  doctor, date, setDate, time, setTime, availability, loading, error, phone, setPhone,
  address, setAddress, check, confirm, close,
}: {
  doctor: Doctor;
  date: string;
  setDate: (value: string) => void;
  time: string;
  setTime: (value: string) => void;
  availability: Availability | null;
  loading: boolean;
  error: string;
  phone: string;
  setPhone: (value: string) => void;
  address: string;
  setAddress: (value: string) => void;
  check: () => void;
  confirm: () => void;
  close: () => void;
}) {
  const minimumDate = new Date().toISOString().slice(0, 10);
  const maximumDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return <div className="modal-backdrop" role="presentation" onClick={close}><section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close icon-button" onClick={close} aria-label="Close"><X size={18} /></button><div className="modal-kicker"><CalendarDays size={15} />BOOK YOUR VISIT</div><h2 id="booking-title">A good next step.</h2><p className="modal-subtitle">Choose a time with {doctor.name}. We’ll confirm it with the clinic.</p>
    <div className="booking-doctor"><div className="doctor-monogram small-monogram">{initials(doctor.name)}</div><div><b>{doctor.name}</b><span>{doctor.specialization} · {doctor.clinicName}</span></div><CheckCircle2 size={17} /></div>
    <label className="field-label">Choose a date<input type="date" min={minimumDate} max={maximumDate} value={date} onChange={(event) => { setDate(event.target.value); setTime(""); }} /></label>
    {error && <div className="auth-error booking-error">{error}</div>}
    {date && <button className="button button-outline full-button" onClick={check} disabled={loading}>{loading ? "Checking clinic calendar…" : "Show available times"}<ArrowRight size={15} /></button>}
    {availability && <div className="time-section"><div className="field-label">Available times <span>{availability.timeZone || "Clinic local time"}</span></div>{availability.slots.length ? <div className="time-grid">{availability.slots.map((slot) => <button key={slot} className={`time-pill ${time === slot ? "selected-time" : ""}`} onClick={() => setTime(slot)}>{slot}</button>)}</div> : <div className="no-slots">No available times on this date. Please select another day.</div>}</div>}
    <label className="field-label">Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" autoComplete="tel" /></label>
    <label className="field-label">Address <span className="optional-label">Optional</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Your address" autoComplete="street-address" /></label>
    <div className="confirmation-note"><ShieldCheck size={15} /><span>Your appointment is only booked after you confirm below.</span></div>
    <button className="button button-primary full-button confirm-button" disabled={!date || !time || !phone.trim()} onClick={confirm}>Confirm appointment<CheckCircle2 size={16} /></button>
  </section></div>;
}
