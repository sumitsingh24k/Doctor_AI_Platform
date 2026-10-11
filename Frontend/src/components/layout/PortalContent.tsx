import { DoctorCalendar } from "../doctor/DoctorCalendar";
import { DoctorDirectory } from "../patient/DoctorDirectory";
import type { useAssistant } from "../../hooks/useAssistant";
import type { useDoctorProfile } from "../../hooks/useDoctorProfile";
import type { usePatientCare } from "../../hooks/usePatientCare";
import { DoctorDashboard } from "../../pages/doctor/DoctorDashboard";
import { DoctorPatients } from "../../pages/doctor/DoctorPatients";
import { DoctorOnboarding } from "../../pages/doctor/DoctorOnboarding";
import { DoctorSettings } from "../../pages/doctor/DoctorSettings";
import { KnowledgeBase } from "../../pages/doctor/KnowledgeBase";
import { AssistantPage } from "../../pages/patient/AssistantPage";
import { PatientAppointments } from "../../pages/patient/PatientAppointments";
import { PatientHome } from "../../pages/patient/PatientHome";
import type { User } from "../../api";
import type { Section } from "../../types/app";

export function PortalContent({ user, section, setSection, care, assistant, doctorProfile, doctorSetup, onSetupComplete }: {
  user: User;
  section: Section;
  setSection: (section: Section) => void;
  care: ReturnType<typeof usePatientCare>;
  assistant: ReturnType<typeof useAssistant>;
  doctorProfile: ReturnType<typeof useDoctorProfile>;
  doctorSetup: boolean;
  onSetupComplete: () => Promise<boolean>;
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
        onVoice={(doctor) => { assistant.openVoiceConversation(doctor); setSection("assistant"); }}
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
        speaking={assistant.speaking}
        voiceActive={assistant.voiceActive}
        voiceState={assistant.voiceState}
        startRecording={() => void assistant.startRecording()}
        stopVoice={assistant.stop}
        onBrowseDoctors={() => setSection("doctors")}
        endRef={assistant.endRef}
        doctors={assistant.doctors}
        doctorsLoading={assistant.doctorsLoading}
        selectedDoctorId={assistant.selectedDoctorId}
        setSelectedDoctorId={assistant.setSelectedDoctorId}
      />;
    }
    if (section === "appointments") {
      return <PatientAppointments appointments={care.appointments} loading={care.appointmentsLoading} setSection={setSection} />;
    }
    return <PatientHome
      appointments={care.appointments}
      appointmentsLoading={care.appointmentsLoading}
      setSection={setSection}
      doctors={care.doctors}
      doctorsLoading={care.doctorsLoading}
      assistant={assistant}
    />;
  }

  if (doctorSetup) return <DoctorOnboarding
    doctorId={doctorProfile.profile._id || user.doctorId || ""}
    profile={doctorProfile.profile}
    email={user.email}
    saving={doctorProfile.saving}
    onSaveProfile={doctorProfile.saveProfile}
    onConnectCalendar={doctorProfile.connectCalendar}
    calendarConnecting={doctorProfile.connectingCalendar}
    onComplete={onSetupComplete}
    onAssistantSaved={doctorProfile.updateAssistantProfile}
  />;

  if (section === "assistant") {
    return <AssistantPage
      doctorMode
      messages={assistant.messages}
      input={assistant.input}
      setInput={assistant.setInput}
      send={() => void assistant.send()}
      busy={assistant.busy}
      recording={assistant.recording}
      speaking={assistant.speaking}
      voiceActive={assistant.voiceActive}
      voiceState={assistant.voiceState}
      startRecording={() => void assistant.startRecording()}
      stopVoice={assistant.stop}
      onBrowseDoctors={() => setSection("home")}
      endRef={assistant.endRef}
      doctors={assistant.doctors.filter((doctor) => doctor._id === doctorProfile.profile._id)}
      doctorsLoading={assistant.doctorsLoading}
      selectedDoctorId={doctorProfile.profile._id || assistant.selectedDoctorId}
      setSelectedDoctorId={assistant.setSelectedDoctorId}
    />;
  }

  if (section === "settings") {
    return <DoctorSettings
      profile={doctorProfile.profile}
      email={user.email}
      saving={doctorProfile.saving}
      onSave={doctorProfile.saveProfile}
      onConnectCalendar={() => void doctorProfile.connectCalendar()}
      calendarConnecting={doctorProfile.connectingCalendar}
      onAssistantSaved={doctorProfile.updateAssistantProfile}
    />;
  }
  if (section === "patients") return <DoctorPatients appointments={care.appointments} loading={care.appointmentsLoading} />;
  if (section === "calendar") {
    return <DoctorCalendar
      appointments={care.appointments}
      doctorId={doctorProfile.profile._id}
      connected={doctorProfile.profile.calendarConnected === "true"}
    />;
  }
  if (section === "knowledge") return <KnowledgeBase />;
  return <DoctorDashboard user={user} appointments={care.appointments} appointmentsLoading={care.appointmentsLoading} profile={doctorProfile.profile} setSection={setSection} />;
}
