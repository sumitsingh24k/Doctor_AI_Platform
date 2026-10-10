import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import type { Appointment } from "../../api";
import { formatDate, initials } from "../../utils/format";

export function DoctorPatients({ appointments }: { appointments: Appointment[] }) {
  const [filter, setFilter] = useState("");
  const patients = useMemo(() => {
    const seen = new Map<string, Appointment>();
    appointments.forEach((item) => { if (!seen.has(item.phoneNumber)) seen.set(item.phoneNumber, item); });
    return [...seen.values()].filter((item) => `${item.patientName} ${item.phoneNumber}`.toLowerCase().includes(filter.toLowerCase()));
  }, [appointments, filter]);
  return <div className="page-wrap"><div className="page-title-row"><div><div className="date-kicker">PATIENT CARE</div><h1>Patients</h1><p>Your clinic’s patient directory, built from appointment records.</p></div><span className="appointment-total">{patients.length} patients</span></div><div className="table-toolbar"><label><Search size={16} /><input placeholder="Search by name or phone" value={filter} onChange={(event) => setFilter(event.target.value)} /></label><span><Users size={15} />Patient list</span></div><div className="patient-table-wrap"><table className="patient-table"><thead><tr><th>PATIENT</th><th>PHONE</th><th>VISIT</th><th>LAST APPOINTMENT</th><th>STATUS</th></tr></thead><tbody>{patients.map((item) => <tr key={`${item.phoneNumber}-${item._id}`}><td><div className="table-person"><div className="patient-mini-avatar">{initials(item.patientName)}</div><span><b>{item.patientName}</b><small>Clinic patient</small></span></div></td><td>{item.phoneNumber}</td><td>{item.visitType || "New"}</td><td>{formatDate(item.appointmentDate)}</td><td><span className={`status-chip ${item.status !== "booked" ? "muted-chip" : ""}`}><i />{item.status}</span></td></tr>)}</tbody></table>{patients.length === 0 && <div className="table-empty"><Users size={20} />No patient records yet.</div>}</div></div>;
}
