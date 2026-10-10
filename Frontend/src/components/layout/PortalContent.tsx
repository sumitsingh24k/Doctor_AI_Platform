import { DoctorCalendar } from "../doctor/DoctorCalendar";
import { DoctorDirectory } from "../patient/DoctorDirectory";
import type { useAssistant } from "../../hooks/useAssistant";
import type { useDoctorProfile } from "../../hooks/useDoctorProfile";
import type { usePatientCare } from "../../hooks/usePatientCare";
import { DoctorDashboard } from "../../pages/doctor/DoctorDashboard";
import { DoctorPatients } from "../../pages/doctor/DoctorPatients";
import { DoctorSettings } from "../../pages/doctor/DoctorSettings";
import { KnowledgeBase } from "../../pages/doctor/KnowledgeBase";
import { AssistantPage } from "../../pages/patient/AssistantPage";
import { PatientAppointments } from "../../pages/patient/PatientAppointments";
import { PatientHome } from "../../pages/patient/PatientHome";
import type { User } from "../../api";
import type { Section } from "../../types/app";

export function PortalContent({ user, section, setSection, care, assistant, doctorProfile }: {
  user: User;
  section: Section;
  setSection: (section: Section) => void;
  care: ReturnType<typeof usePatientCare>;
  assistant: ReturnType<typeof useAssistant>;
  doctorProfile: ReturnType<typeof useDoctorProfile>;
}) {
  if (user.role === "patient") {
    if (section === "doctors") {
      return <DoctorDirectory
        doctors={care.displayedDoctors}
        loading={care.doctorsLoading}
        locationMessage={care.locationMessage}
        location={care.location}
        specialty={care.specialty}
        setSpecialty={care.setSpecialty}
        search={care.search}
        setSearch={care.setSearch}
        requestLocation={care.requestLocation}
        onBook={care.openBooking}
        onAssistant={() => setSection("assistant")}
      />;
    }
    if (section === "assistant") {
      return <AssistantPage
        messages={assistant.messages}
        input={assistant.input}
        setInput={assistant.setInput}
        send={() => void assistant.send()}
        busy={assistant.busy}
        recording={assistant.recording}
        startRecording={() => void assistant.startRecording()}
        stopRecording={assistant.stopRecording}
        onBrowseDoctors={() => setSection("doctors")}
        endRef={assistant.endRef}
      />;
    }
    if (section === "appointments") {
      return <PatientAppointments appointments={care.appointments} setSection={setSection} />;
    }
    return <PatientHome
      user={user}
      appointments={care.appointments}
      setSection={setSection}
      requestLocation={care.requestLocation}
      locationMessage={care.locationMessage}
      doctors={care.doctors}
      onBook={care.openBooking}
    />;
  }

  if (section === "settings") {
    return <DoctorSettings
      profile={doctorProfile.profile}
      saving={doctorProfile.saving}
      onSave={doctorProfile.saveProfile}
      onConnectCalendar={() => void doctorProfile.connectCalendar()}
      calendarConnecting={doctorProfile.connectingCalendar}
    />;
  }
  if (section === "patients") return <DoctorPatients appointments={care.appointments} />;
  if (section === "calendar") {
    return <DoctorCalendar
      appointments={care.appointments}
      doctorId={doctorProfile.profile._id}
      connected={doctorProfile.profile.calendarConnected === "true"}
    />;
  }
  if (section === "knowledge") return <KnowledgeBase />;
  return <DoctorDashboard user={user} appointments={care.appointments} setSection={setSection} />;
}
