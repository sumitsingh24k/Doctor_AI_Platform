import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin, Navigation } from "lucide-react";
import type { Doctor } from "../../api";

type Coordinates = { latitude: number; longitude: number };

const patientIcon = L.divIcon({
  className: "patient-map-marker",
  html: '<span></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const clinicIcon = L.divIcon({
  className: "clinic-map-marker",
  html: '<span></span>',
  iconSize: [30, 38],
  iconAnchor: [15, 34],
  popupAnchor: [0, -32],
});

function hasClinicCoordinates(doctor: Doctor): doctor is Doctor & { clinicLatitude: number; clinicLongitude: number } {
  const { clinicLatitude, clinicLongitude } = doctor;
  return typeof clinicLatitude === "number" && Number.isFinite(clinicLatitude) && clinicLatitude >= -90 && clinicLatitude <= 90 &&
    typeof clinicLongitude === "number" && Number.isFinite(clinicLongitude) && clinicLongitude >= -180 && clinicLongitude <= 180;
}

function RecenterMap({ position }: { position: Coordinates }) {
  const map = useMap();
  useEffect(() => {
    map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 12));
  }, [map, position.latitude, position.longitude]);
  return null;
}

export function DoctorMap({ location, doctors, onBook }: {
  location: Coordinates;
  doctors: Doctor[];
  onBook: (doctor: Doctor) => void;
}) {
  const mappedDoctors = useMemo(
    () => doctors.filter(hasClinicCoordinates),
    [doctors],
  );

  return <section className="doctor-map-section" aria-label="Nearby clinics map">
    <div className="doctor-map-heading">
      <div><span className="map-kicker"><Navigation size={13} /> OPENSTREETMAP</span><h2>Care around you</h2><p>Your location and nearby clinics with saved map coordinates.</p></div>
      <span className="map-count"><MapPin size={14} />{mappedDoctors.length} mapped {mappedDoctors.length === 1 ? "clinic" : "clinics"}</span>
    </div>
    <div className="doctor-map-frame">
      <MapContainer center={[location.latitude, location.longitude]} zoom={12} scrollWheelZoom={false} className="doctor-map">
        <RecenterMap position={location} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[location.latitude, location.longitude]} icon={patientIcon}>
          <Popup>You are here</Popup>
        </Marker>
        {mappedDoctors.map((doctor) => <Marker
          key={doctor._id}
          position={[doctor.clinicLatitude, doctor.clinicLongitude]}
          icon={clinicIcon}
        >
          <Popup>
            <div className="clinic-map-popup">
              <b>{doctor.clinicName || doctor.name}</b>
              <span>{doctor.name} · {doctor.specialization || "General practice"}</span>
              <button type="button" disabled={doctor.calendarConnected === false} onClick={() => onBook(doctor)}>
                {doctor.calendarConnected === false ? "Booking unavailable" : "Book visit"}
              </button>
            </div>
          </Popup>
        </Marker>)}
      </MapContainer>
    </div>
    {!mappedDoctors.length && <p className="map-coordinate-note">No clinic profiles in this result have saved coordinates yet. Clinics can add latitude and longitude in doctor settings.</p>}
  </section>;
}
