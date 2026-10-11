import { useEffect, useRef, useState } from "react";
import { Activity, AudioLines, BookOpen, CalendarDays, CheckCircle2, LayoutDashboard, Settings, Sparkles, Stethoscope, Users, X } from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { BookingModal } from "./components/booking/BookingModal";
import { AppShell, type NavigationItem } from "./components/layout/AppShell";
import { PortalContent } from "./components/layout/PortalContent";
import { DoctorOnboarding } from "./pages/doctor/DoctorOnboarding";
import { useAssistant } from "./hooks/useAssistant";
import { useAuthSession } from "./hooks/useAuthSession";
import { useDoctorProfile } from "./hooks/useDoctorProfile";
import { usePatientCare } from "./hooks/usePatientCare";
import type { Section } from "./types/app";

const patientNavigation: NavigationItem[] = [
  { id: "home", label: "Overview", icon: LayoutDashboard },
  { id: "doctors", label: "Find a doctor", icon: Stethoscope },
  { id: "assistant", label: "AI assistant", icon: Sparkles },
  { id: "appointments", label: "My appointments", icon: CalendarDays },
];

const doctorNavigation: NavigationItem[] = [
  { id: "home", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "assistant", label: "Voice playground", icon: AudioLines },
  { id: "patients", label: "Patients", icon: Users },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "settings", label: "Settings", icon: Settings },
];

function App() {
  const auth = useAuthSession();
  const [guestMode, setGuestMode] = useState(false);
  const initialSessionChecked = useRef(false);
  const [section, setSection] = useState<Section>("home");
  const [mobileNav, setMobileNav] = useState(false);
  const guestUser = { id: "guest", name: "Guest", email: "", role: "patient" as const };
  const activeUser = auth.user ?? (guestMode ? guestUser : null);
  const care = usePatientCare({
    user: activeUser,
    authenticated: Boolean(auth.user),
    section,
    setSection,
    setError: auth.setError,
    setNotice: auth.setNotice,
  });
  const assistant = useAssistant(auth.setError);
  const doctorProfile = useDoctorProfile({
    user: auth.user,
    setUser: auth.setUser,
    setError: auth.setError,
    setNotice: auth.setNotice,
  });

  useEffect(() => {
    if (section !== "assistant" && assistant.voiceActive) assistant.stop();
  }, [section, assistant.voiceActive, assistant.stop]);

  useEffect(() => {
    if (auth.user?.role === "doctor" && doctorProfile.profile._id && assistant.selectedDoctorId !== doctorProfile.profile._id) {
      assistant.setSelectedDoctorId(doctorProfile.profile._id);
    }
  }, [auth.user?.role, doctorProfile.profile._id, assistant.selectedDoctorId, assistant.setSelectedDoctorId]);

  useEffect(() => {
    if (auth.loadingSession || initialSessionChecked.current) return;
    initialSessionChecked.current = true;
    if (!auth.user) setGuestMode(true);
  }, [auth.loadingSession, auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    if (auth.user.role === "doctor") {
      const complete = Boolean(
        auth.user.doctorId &&
        doctorProfile.profile._id === auth.user.doctorId &&
        doctorProfile.profile.calendarConnected === "true" &&
        doctorProfile.profile.setupComplete === "true"
      );
      setSection(complete ? "home" : "settings");
      return;
    }
    setSection("home");
  }, [auth.user, doctorProfile.profile._id, doctorProfile.profile.calendarConnected, doctorProfile.profile.setupComplete]);

  if (auth.loadingSession) {
    return <div className="session-loader"><div className="brand-mark"><Activity size={21} /></div><span>Preparing your care space…</span></div>;
  }
  if (!activeUser) {
    return <AuthScreen
      role={auth.authRole}
      setRole={auth.setAuthRole}
      registering={auth.registering}
      setRegistering={auth.setRegistering}
      onSubmit={auth.authenticate}
      error={auth.error}
      onContinueAsGuest={() => { auth.setError(""); setGuestMode(true); }}
    />;
  }

  const user = activeUser;
  const isGuest = !auth.user;
  const isPatient = user.role === "patient";
  const doctorSetupComplete = Boolean(user.role === "doctor" && user.doctorId && doctorProfile.profile._id === user.doctorId && doctorProfile.profile.calendarConnected === "true" && doctorProfile.profile.setupComplete === "true");
  const doctorSetup = user.role === "doctor" && !isGuest && !doctorSetupComplete;
  const navigation = isPatient ? patientNavigation : doctorSetup
    ? [{ id: "settings" as const, label: "Clinic setup", icon: Settings }]
    : doctorNavigation;
  const navigate = (next: Section) => {
    if (isGuest && next === "appointments") {
      auth.setAuthRole("patient");
      setGuestMode(false);
      return;
    }
    if (next !== "assistant") assistant.stop();
    setSection(next);
  };
  const logout = async () => {
    assistant.reset();
    await auth.logout();
    setGuestMode(false);
    setSection("home");
  };
  const completeDoctorSetup = async () => {
    const complete = await doctorProfile.completeSetup();
    if (!complete) return false;
    setSection("home");
    return true;
  };

  if (doctorSetup) {
    return <div className="doctor-setup-shell">
      <header className="doctor-setup-topbar"><div className="brand"><div className="brand-mark"><Activity size={19} /></div><span>medimind</span></div><span>Doctor setup</span><button className="button button-outline" type="button" onClick={() => void logout()}>Sign out</button></header>
      <main className="doctor-setup-main">
        {auth.notice && <div className="notice"><CheckCircle2 size={17} />{auth.notice}<button onClick={() => auth.setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
        {auth.error && <div className="error-banner"><Activity size={16} />{auth.error}<button onClick={() => auth.setError("")} aria-label="Dismiss"><X size={15} /></button></div>}
        <DoctorOnboarding doctorId={doctorProfile.profile._id || user.doctorId || ""} profile={doctorProfile.profile} email={user.email} saving={doctorProfile.saving} onSaveProfile={doctorProfile.saveProfile} onConnectCalendar={doctorProfile.connectCalendar} calendarConnecting={doctorProfile.connectingCalendar} onComplete={completeDoctorSetup} onAssistantSaved={doctorProfile.updateAssistantProfile} />
      </main>
    </div>;
  }
  return <>
    <AppShell
      user={user}
      section={section}
      navigation={navigation}
      appointmentsCount={care.appointments.length}
      isGuest={isGuest}
      search={care.search}
      setSearch={care.setSearch}
      mobileNav={mobileNav}
      setMobileNav={setMobileNav}
      onNavigate={navigate}
      onLogout={() => void logout()}
      onSignIn={() => { auth.setAuthRole("patient"); setGuestMode(false); }}
      onDoctorPortal={() => { auth.setError(""); auth.setAuthRole("doctor"); auth.setRegistering(false); setGuestMode(false); }}
    >
      {auth.notice && <div className="notice"><CheckCircle2 size={17} />{auth.notice}<button onClick={() => auth.setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
      {auth.error && <div className="error-banner"><Activity size={16} />{auth.error}<button onClick={() => auth.setError("")} aria-label="Dismiss"><X size={15} /></button></div>}
      <PortalContent
        user={user}
        section={section}
        setSection={setSection}
        care={care}
        assistant={assistant}
        doctorProfile={doctorProfile}
        doctorSetup={false}
        onSetupComplete={completeDoctorSetup}
      />
    </AppShell>
    {isPatient && care.selectedDoctor && <BookingModal
      doctor={care.selectedDoctor}
      date={care.bookDate}
      setDate={care.setBookDate}
      time={care.bookTime}
      setTime={care.setBookTime}
      availability={care.availability}
      loading={care.availabilityLoading}
      error={auth.error}
      phone={care.bookPhone}
      setPhone={care.setBookPhone}
      patientName={auth.user?.name ?? care.patientName}
      setPatientName={care.setPatientName}
      email={auth.user?.email ?? care.patientEmail}
      setEmail={care.setPatientEmail}
      isGuest={isGuest}
      address={care.bookAddress}
      setAddress={care.setBookAddress}
      check={() => void care.checkAvailability()}
      confirm={() => void care.confirmBooking()}
      close={care.closeBooking}
    />}
  </>;
}

export default App;
