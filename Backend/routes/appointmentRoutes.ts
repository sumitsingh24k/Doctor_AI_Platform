import { Router } from "express";
import {
  Bookappointment,
  CancelAppointment,
  RescheduleAppointment,
  completeAppointment,
  createDoctorRevisit,
  findPatientByPhone,
  getAllPatients,
  getAllPatientAppointments,
  getAppointmentAvailability,
  getPatient,
} from "../controller/patientcontroller.js";
import { optionalAgentContext } from "../middleware/agentContext.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";

const appointmentRoutes = Router();
appointmentRoutes.use(optionalAgentContext);

appointmentRoutes.post("/api/appointments/book", optionalAuth, Bookappointment);
appointmentRoutes.post("/bookappointment", Bookappointment); // Legacy endpoint.
appointmentRoutes.get("/api/appointments/availability", getAppointmentAvailability);
appointmentRoutes.post("/api/appointments/reschedule", RescheduleAppointment);
appointmentRoutes.post("/api/appointments/cancel", CancelAppointment);
appointmentRoutes.get("/api/appointments", requireAuth, getAllPatientAppointments);
appointmentRoutes.post(
  "/api/doctor/appointments/:appointmentId/complete",
  completeAppointment
);
appointmentRoutes.post("/api/doctor/revisits", createDoctorRevisit);

appointmentRoutes.get("/api/doctor/patients/phone/:phoneNumber", findPatientByPhone);
appointmentRoutes.get("/api/doctor/patients", requireAuth, requireRole("doctor", "admin"), getAllPatients);
appointmentRoutes.get("/api/doctor/patients/:patientId", requireAuth, requireRole("doctor", "admin"), getPatient);

export default appointmentRoutes;
