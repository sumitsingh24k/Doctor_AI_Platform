import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Appointment, type Doctor, type User } from "../api";
import type { Availability, LocationCoordinates, Section } from "../types/app";

export function usePatientCare({
  user,
  authenticated,
  section,
  setSection,
  setError,
  setNotice,
}: {
  user: User | null;
  authenticated: boolean;
  section: Section;
  setSection: (section: Section) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [specialty, setSpecialty] = useState("All specialties");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [bookDate, setBookDate] = useState("");
  const [bookTime, setBookTime] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookPhone, setBookPhone] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [bookAddress, setBookAddress] = useState("");

  const displayedDoctors = useMemo(() => {
    const term = search.trim().toLowerCase();
    return doctors.filter((doctor) => {
      const matchesSpecialty = specialty === "All specialties" || doctor.specialization?.toLowerCase().includes(specialty.toLowerCase());
      const matchesSearch = !term || [doctor.name, doctor.specialization, doctor.clinicName, doctor.clinicAddress].some((value) => value?.toLowerCase().includes(term));
      return matchesSpecialty && matchesSearch;
    });
  }, [doctors, search, specialty]);

  const loadDoctors = useCallback(async (
    coordinates?: LocationCoordinates,
    specialtyFilter = "All specialties",
    searchTerm = "",
  ) => {
    setDoctorsLoading(true);
    try {
      const params = new URLSearchParams();
      if (coordinates) {
        params.set("latitude", String(coordinates.latitude));
        params.set("longitude", String(coordinates.longitude));
      }
      if (specialtyFilter !== "All specialties") params.set("specialty", specialtyFilter);
      if (searchTerm.trim()) params.set("q", searchTerm.trim());
      const query = params.size ? `?${params}` : "";
      const result = await api<{ doctors: Doctor[] }>(`/api/doctor/directory${query}`);
      setDoctors(result.doctors);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load doctors.");
    } finally {
      setDoctorsLoading(false);
    }
  }, [setError]);

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const result = await api<{ appointments: Appointment[] }>("/api/appointments");
      setAppointments(result.appointments ?? []);
    } catch (reason) {
      setAppointments([]);
      setError(reason instanceof Error ? reason.message : "Unable to load appointments. Please refresh and try again.");
    } finally {
      setAppointmentsLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    if (!user || !authenticated) {
      setAppointments([]);
      setAppointmentsLoading(false);
      if (!user) {
        setDoctors([]);
        setSelectedDoctor(null);
        setBookDate("");
        setBookTime("");
        setAvailability(null);
        setBookPhone("");
        setPatientName("");
        setPatientEmail("");
        setBookAddress("");
      }
      return;
    }
    setAppointments([]);
    void loadAppointments();
  }, [user, authenticated, loadAppointments]);

  useEffect(() => {
    if (user?.role === "patient") void loadDoctors(location ?? undefined);
  }, [user?.role, location, loadDoctors]);

  useEffect(() => {
    if (user?.role !== "patient" || section !== "doctors") return;
    const timer = window.setTimeout(() => {
      void loadDoctors(location ?? undefined, specialty, search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [user, section, location, specialty, search, loadDoctors]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser. You can still browse clinics.");
      void loadDoctors();
      setSection("doctors");
      return;
    }
    setLocationMessage("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLocation(coordinates);
        setLocationMessage("Showing clinics nearest to your location.");
        setSection("doctors");
        void loadDoctors(coordinates);
      },
      () => {
        setLocationMessage("Location permission was not granted. Showing available clinics without distance sorting.");
        void loadDoctors();
        setSection("doctors");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const openBooking = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setBookDate("");
    setBookTime("");
    setAvailability(null);
    setError("");
  };

  const checkAvailability = async () => {
    if (!selectedDoctor || !bookDate) return;
    setAvailabilityLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date: bookDate, doctorId: selectedDoctor._id });
      setAvailability(await api<Availability>(`/api/appointments/availability?${params}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to check appointment times.");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const confirmBooking = async () => {
    if (!selectedDoctor || !user || !bookDate || !bookTime || !bookPhone.trim() || (!authenticated && patientName.trim().length < 2)) {
      setError("Please add your name and phone number, then choose an available appointment time.");
      return;
    }
    setError("");
    try {
      await api("/api/appointments/book", {
        method: "POST",
        body: JSON.stringify({
          doctorId: selectedDoctor._id,
          patientName: authenticated ? user.name : patientName.trim(),
          phoneNumber: bookPhone,
          appointmentDate: bookDate,
          appointmentTime: bookTime,
          email: authenticated ? user.email : patientEmail.trim(),
          address: bookAddress,
        }),
      });
      setSelectedDoctor(null);
      setNotice("Your appointment is confirmed. The clinic has your contact details.");
      if (authenticated) {
        await loadAppointments();
        setSection("appointments");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to book this appointment.");
    }
  };

  return {
    appointments, appointmentsLoading, loadAppointments, doctors, displayedDoctors, doctorsLoading,
    specialty, setSpecialty, search, setSearch, location, locationMessage, requestLocation,
    selectedDoctor, openBooking, closeBooking: () => setSelectedDoctor(null),
    bookDate, setBookDate, bookTime, setBookTime, availability, availabilityLoading,
    bookPhone, setBookPhone, patientName, setPatientName, patientEmail, setPatientEmail,
    bookAddress, setBookAddress, checkAvailability, confirmBooking,
  };
}
