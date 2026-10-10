import { useCallback, useEffect, useState } from "react";
import { api, type User } from "../api";

function normalizeProfile(profile: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, String(value ?? "")]));
}

export function useDoctorProfile({
  user,
  setUser,
  setError,
  setNotice,
}: {
  user: User | null;
  setUser: (user: User | null | ((current: User | null) => User | null)) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const result = await api<{ doctor: Record<string, unknown> }>("/api/doctor/profile");
      setProfile(normalizeProfile(result.doctor));
    } catch (reason) {
      setProfile({});
      setError(reason instanceof Error ? reason.message : "Unable to load doctor profile.");
    }
  }, [setError]);

  useEffect(() => {
    if (user?.role === "doctor") void loadProfile();
  }, [user, loadProfile]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(form.entries());
    body.appointmentDurationMinutes = Number(body.appointmentDurationMinutes || 30);
    body.clinicLatitude = body.clinicLatitude ? Number(body.clinicLatitude) : undefined;
    body.clinicLongitude = body.clinicLongitude ? Number(body.clinicLongitude) : undefined;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ doctor: Record<string, unknown> }>("/api/doctor/profile", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setProfile(normalizeProfile(result.doctor));
      setUser((current) => current ? { ...current, doctorId: String(result.doctor._id) } : current);
      setNotice("Clinic profile saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the profile.");
    } finally {
      setSaving(false);
    }
  };

  const connectCalendar = async () => {
    if (!profile._id) {
      setError("Save your clinic profile before connecting Google Calendar.");
      return;
    }
    setConnectingCalendar(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>(`/api/google-calendar/doctors/${profile._id}/connect`);
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start Google Calendar connection.");
      setConnectingCalendar(false);
    }
  };

  return { profile, saving, connectingCalendar, saveProfile, connectCalendar };
}
