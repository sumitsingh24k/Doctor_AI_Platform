import {
  Activity, ArrowRight, CheckCircle2, ChevronDown, Clock3, MapPin, Search, ShieldCheck, Sparkles, Stethoscope,
} from "lucide-react";
import type { Doctor } from "../../api";
import { DoctorMap } from "./DoctorMap";
import { initials } from "../../utils/format";

const specialties = ["All specialties", "Cardiology", "Dermatology", "Dentistry", "General Physician", "Neurology", "Pediatrics"];

export function DoctorCard({ doctor, onBook, compact = false, rank }: {
  doctor: Doctor;
  onBook: (doctor: Doctor) => void;
  compact?: boolean;
  rank?: number;
}) {
  const calendarConnected = doctor.calendarConnected !== false;
  return <article className={`doctor-card ${compact ? "doctor-card-compact" : ""}`}><div className="doctor-monogram">{initials(doctor.name)}</div><div className="doctor-details"><div className="doctor-name-line"><h3>{doctor.name}</h3>{rank === 1 && doctor.distanceKm !== null && <span className="recommended-tag"><Sparkles size={12} />Closest match</span>}</div><div className="doctor-specialty">{doctor.specialization || "General practice"}<span>·</span>{doctor.qualification}</div><div className="doctor-clinic"><MapPin size={14} /><span>{doctor.clinicName} · {doctor.clinicAddress}</span>{doctor.distanceKm !== null && <b>{doctor.distanceKm < 1 ? `${Math.round(doctor.distanceKm * 1000)} m` : `${doctor.distanceKm.toFixed(1)} km`}</b>}</div>{!compact && <p className="doctor-about">{doctor.aboutDoctor}</p>}<div className="doctor-tags"><span>{calendarConnected ? <><CheckCircle2 size={12} />Calendar availability</> : <><Clock3 size={12} />Calendar setup pending</>}</span><span><Clock3 size={12} />{doctor.clinicOpeningTime}–{doctor.clinicClosingTime}</span></div></div><div className="doctor-card-action"><span className={`availability-note ${calendarConnected ? "" : "availability-pending"}`}><i />{calendarConnected ? "Accepting appointments" : "Booking not available yet"}</span><button className="button button-primary button-small" disabled={!calendarConnected} onClick={() => onBook(doctor)}>{calendarConnected ? <>Book visit<ArrowRight size={14} /></> : "Unavailable"}</button></div></article>;
}

export function DoctorDirectory({ doctors, loading, locationMessage, location, specialty, setSpecialty, search, setSearch, requestLocation, onBook, onAssistant }: {
  doctors: Doctor[];
  loading: boolean;
  locationMessage: string;
  location: { latitude: number; longitude: number } | null;
  specialty: string;
  setSpecialty: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  requestLocation: () => void;
  onBook: (doctor: Doctor) => void;
  onAssistant: () => void;
}) {
  return <div className="page-wrap">
    <div className="page-title-row"><div><div className="date-kicker">PERSONALIZED CARE</div><h1>Find your doctor</h1><p>Trusted specialists, sorted around what matters to you.</p></div><button className={`button ${location ? "button-soft" : "button-outline"}`} onClick={requestLocation}><MapPin size={16} />{location ? "Location enabled" : "Use my location"}</button></div>
    <div className="directory-search"><div className="directory-search-input"><Search size={18} /><input placeholder="Search a doctor, clinic, or specialty" aria-label="Search doctors" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span><ShieldCheck size={15} />Your location is only used with your permission</span></div>
    <div className="filters-row"><div className="filter-label">SPECIALTY</div><div className="specialty-pills">{specialties.map((value) => <button key={value} className={`filter-pill ${specialty === value ? "chosen" : ""}`} onClick={() => setSpecialty(value)}>{value === "All specialties" ? <Activity size={14} /> : null}{value}</button>)}</div></div>
    {locationMessage && <div className="location-status"><MapPin size={15} />{locationMessage}</div>}
    <div className="directory-heading"><div><h2>{loading ? "Finding doctors…" : `${doctors.length} ${doctors.length === 1 ? "specialist" : "specialists"} to explore`}</h2><span>{location ? "Closest clinics shown first" : "Share your location to sort by distance"}</span></div><div className="sort-select"><span>Sort by</span><b>{location ? "Nearest to you" : "Recommended"}</b><ChevronDown size={15} /></div></div>
    {location && <DoctorMap location={location} doctors={doctors} onBook={onBook} />}
    {loading ? <div className="doctor-list">{[0, 1, 2].map((item) => <div className="doctor-skeleton" key={item}><div className="skeleton-avatar" /><div className="skeleton-lines"><i /><i /><i /></div></div>)}</div>
      : doctors.length ? <div className="doctor-list">{doctors.map((doctor, index) => <DoctorCard doctor={doctor} onBook={onBook} key={doctor._id} rank={index + 1} />)}</div>
        : <div className="empty-state"><div className="empty-icon"><Stethoscope size={23} /></div><h3>No matching doctors yet</h3><p>Try another specialty, or check back as more clinics join Medimind.</p><button className="button button-soft" onClick={onAssistant}><Sparkles size={16} />Ask your assistant</button></div>}
    <div className="directory-bottom-note"><ShieldCheck size={16} /><span>Doctor profiles are provided by clinics. Please confirm details with the practice before your visit.</span></div>
  </div>;
}
