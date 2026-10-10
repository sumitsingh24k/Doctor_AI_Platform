import { useEffect, useState } from "react";
import { Activity, BookOpen, CalendarDays, CheckCircle2, LayoutDashboard, Settings, Sparkles, Stethoscope, Users, X } from "lucide-react";
import { AuthScreen } from "./components/auth/AuthScreen";
import { BookingModal } from "./components/booking/BookingModal";
import { AppShell, type NavigationItem } from "./components/layout/AppShell";
import { PortalContent } from "./components/layout/PortalContent";
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
  { id: "patients", label: "Patients", icon: Users },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "settings", label: "Settings", icon: Settings },
];

function App() {
  const auth = useAuthSession();
  const [section, setSection] = useState<Section>("home");
  const [mobileNav, setMobileNav] = useState(false);
  const care = usePatientCare({
    user: auth.user,
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
    if (!auth.user) return;
    setSection(auth.user.role === "doctor" && !auth.user.doctorId ? "settings" : "home");
  }, [auth.user]);

  if (auth.loadingSession) {
    return <div className="session-loader"><div className="brand-mark"><Activity size={21} /></div><span>Preparing your care space…</span></div>;
  }
  if (!auth.user) {
    return <AuthScreen
      role={auth.authRole}
      setRole={auth.setAuthRole}
      registering={auth.registering}
      setRegistering={auth.setRegistering}
      onSubmit={auth.authenticate}
      error={auth.error}
    />;
  }

  const user = auth.user;
  const isPatient = user.role === "patient";
  const navigation = isPatient ? patientNavigation : doctorNavigation;
  const navigate = (next: Section) => {
    if (assistant.recording && next !== "assistant") assistant.stopRecording();
    setSection(next);
  };
  const logout = async () => {
    assistant.stop();
    await auth.logout();
    setSection("home");
  };
  return <>
    <AppShell
      user={user}
      section={section}
      navigation={navigation}
      appointmentsCount={care.appointments.length}
      search={care.search}
      setSearch={care.setSearch}
      mobileNav={mobileNav}
      setMobileNav={setMobileNav}
      onNavigate={navigate}
      onLogout={() => void logout()}
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
      address={care.bookAddress}
      setAddress={care.setBookAddress}
      check={() => void care.checkAvailability()}
      confirm={() => void care.confirmBooking()}
      close={care.closeBooking}
    />}
  </>;
}

export default App;
