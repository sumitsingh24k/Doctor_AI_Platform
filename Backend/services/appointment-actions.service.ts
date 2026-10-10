import Appointment from "../modal/appointmentschema.js";
import Patient from "../modal/patientschema.js";
import {
  DEFAULT_TIME_ZONE,
  buildAppointmentWindow,
  checkClinicWorkingHours,
  checkDoctorCalendarAvailability,
  createDoctorCalendarEvent,
  deleteDoctorCalendarEvent,
  findConnectedDoctor,
  updateDoctorCalendarEvent,
} from "../lib/google.js";
import { isWithinBookingWindow, normalizeAppointmentDate } from "../lib/appointmentDate.js";
import { getAgentContext } from "../lib/requestContext.js";

export class AppointmentActionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

const normalizePhoneNumber = (value: string) => value.trim().replace(/[\s()-]/g, "");
const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const isValidPhoneNumber = (phoneNumber: string) => /^\+?[0-9]{7,15}$/.test(phoneNumber);
const isValidAppointmentDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};
const appointmentDateQuery = (appointmentDate: string) => {
  const start = new Date(`${appointmentDate}T00:00:00.000Z`);
  return { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

const doctorFilter = () => {
  const context = getAgentContext();
  return context ? { doctorId: context.doctorId } : {};
};

export type BookAppointmentInput = {
  patientName: string;
  phoneNumber: string;
  appointmentDate: string;
  appointmentTime: string;
  email?: string | undefined;
  address?: string | undefined;
  medicalHistory?: string | undefined;
};

export const bookAppointment = async (input: BookAppointmentInput) => {
  const patientName = normalizeName(input.patientName);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const appointmentTime = input.appointmentTime.trim();
  const appointmentDate = normalizeAppointmentDate(input.appointmentDate);

  if (
    patientName.length < 2 ||
    !isValidPhoneNumber(phoneNumber) ||
    !appointmentDate ||
    !isValidAppointmentDate(appointmentDate) ||
    !appointmentTime
  ) {
    throw new AppointmentActionError(
      "Valid patient name, phone number, date and time are required",
      400
    );
  }
  if (!isWithinBookingWindow(appointmentDate)) {
    throw new AppointmentActionError("Appointments can only be booked within the next 7 days", 400);
  }

  const doctor = await findConnectedDoctor();
  const durationMinutes = doctor.appointmentDurationMinutes || 30;
  const { start, end, timeZone } = buildAppointmentWindow(
    appointmentDate,
    appointmentTime,
    durationMinutes,
    doctor.clinicTimeZone || DEFAULT_TIME_ZONE
  );
  if (start <= new Date()) {
    throw new AppointmentActionError("Appointment must be scheduled for a future time", 400);
  }
  if (!checkClinicWorkingHours(doctor, start, end).isWithinClinicHours) {
    throw new AppointmentActionError("Currently the clinic is not available at this time slot", 409);
  }
  if (!(await checkDoctorCalendarAvailability(doctor, start, end, timeZone)).isAvailable) {
    throw new AppointmentActionError("This appointment slot is not available on Google Calendar", 409);
  }
  if (
    await Appointment.findOne({
      doctorId: doctor._id,
      appointmentDate: appointmentDateQuery(appointmentDate),
      appointmentTime,
      status: "booked",
    })
  ) {
    throw new AppointmentActionError("This appointment slot is already booked", 409);
  }

  let patient = await Patient.findOne({ ...doctorFilter(), phoneNumber });
  if (patient && patient.name.toLowerCase() !== patientName.toLowerCase()) {
    throw new AppointmentActionError("This phone number is already registered with another patient", 409);
  }
  if (!patient) {
    patient = await Patient.create({
      doctorId: doctor._id,
      name: patientName,
      phoneNumber,
      email: input.email?.trim() ?? "",
      address: input.address?.trim() ?? "",
      medicalHistory: input.medicalHistory?.trim() ?? "",
    });
  }

  const appointment = new Appointment({
    doctorId: doctor._id,
    patientId: patient._id,
    patientName,
    phoneNumber,
    appointmentDate,
    appointmentTime,
    status: "booked",
    visitType: "new",
  });
  const googleEventId = await createDoctorCalendarEvent({
    doctor,
    patientName,
    phoneNumber,
    appointmentDate,
    appointmentTime,
    appointmentId: appointment._id.toString(),
    durationMinutes,
  });
  if (!googleEventId) {
    throw new AppointmentActionError("Google Calendar event was created but no event id was returned", 502);
  }
  appointment.googleEventId = googleEventId;
  await appointment.save();

  return appointment;
};

export type RescheduleAppointmentInput = {
  appointmentId: string;
  patientName: string;
  phoneNumber: string;
  appointmentDate: string;
  appointmentTime: string;
};

export const rescheduleAppointment = async (input: RescheduleAppointmentInput) => {
  const patientName = normalizeName(input.patientName);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const appointmentTime = input.appointmentTime.trim();
  const appointmentDate = normalizeAppointmentDate(input.appointmentDate);
  if (!input.appointmentId || patientName.length < 2 || !isValidPhoneNumber(phoneNumber) || !appointmentDate || !isValidAppointmentDate(appointmentDate) || !appointmentTime) {
    throw new AppointmentActionError("Appointment ID, patient name, phone number, date and time are required", 400);
  }
  if (!isWithinBookingWindow(appointmentDate)) {
    throw new AppointmentActionError("Appointments can only be rescheduled within the next 7 days", 400);
  }
  const appointment = await Appointment.findOne({ ...doctorFilter(), _id: input.appointmentId });
  if (!appointment) throw new AppointmentActionError("Appointment not found", 404);
  if (appointment.status === "cancelled") throw new AppointmentActionError("Cancelled appointment cannot be rescheduled", 400);
  if (appointment.patientName.toLowerCase() !== patientName.toLowerCase() || normalizePhoneNumber(appointment.phoneNumber) !== phoneNumber) {
    throw new AppointmentActionError("Patient details do not match this appointment", 403);
  }
  if (!appointment.doctorId) throw new AppointmentActionError("Appointment is not linked to a doctor profile", 400);

  const doctor = await findConnectedDoctor(appointment.doctorId.toString());
  const durationMinutes = doctor.appointmentDurationMinutes || 30;
  const { start, end, timeZone } = buildAppointmentWindow(appointmentDate, appointmentTime, durationMinutes, doctor.clinicTimeZone || DEFAULT_TIME_ZONE);
  if (start <= new Date()) throw new AppointmentActionError("Appointment must be scheduled for a future time", 400);
  if (!checkClinicWorkingHours(doctor, start, end).isWithinClinicHours) {
    throw new AppointmentActionError("Currently the clinic is not available at this time slot", 409);
  }
  if (!(await checkDoctorCalendarAvailability(doctor, start, end, timeZone, appointment.googleEventId || undefined)).isAvailable) {
    throw new AppointmentActionError("This appointment slot is not available on Google Calendar", 409);
  }
  if (await Appointment.findOne({ _id: { $ne: appointment._id }, doctorId: appointment.doctorId, appointmentDate: appointmentDateQuery(appointmentDate), appointmentTime, status: "booked" })) {
    throw new AppointmentActionError("This appointment slot is already booked", 409);
  }
  if (appointment.googleEventId) {
    await updateDoctorCalendarEvent({ doctor, eventId: appointment.googleEventId, patientName: appointment.patientName, phoneNumber: appointment.phoneNumber, appointmentDate, appointmentTime, appointmentId: appointment._id.toString(), durationMinutes });
  }
  appointment.appointmentDate = new Date(`${appointmentDate}T00:00:00.000Z`);
  appointment.appointmentTime = appointmentTime;
  await appointment.save();
  return appointment;
};

export type CancelAppointmentInput = Pick<RescheduleAppointmentInput, "appointmentId" | "patientName" | "phoneNumber">;

export const cancelAppointment = async (input: CancelAppointmentInput) => {
  const patientName = normalizeName(input.patientName);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  if (!input.appointmentId || patientName.length < 2 || !isValidPhoneNumber(phoneNumber)) {
    throw new AppointmentActionError("Appointment ID, patient name and phone number are required", 400);
  }
  const appointment = await Appointment.findOne({ ...doctorFilter(), _id: input.appointmentId });
  if (!appointment) throw new AppointmentActionError("Appointment not found", 404);
  if (appointment.patientName.toLowerCase() !== patientName.toLowerCase() || normalizePhoneNumber(appointment.phoneNumber) !== phoneNumber) {
    throw new AppointmentActionError("Patient details do not match this appointment", 403);
  }
  if (appointment.status === "cancelled") throw new AppointmentActionError("Appointment is already cancelled", 409);
  if (appointment.googleEventId && appointment.doctorId) {
    const doctor = await findConnectedDoctor(appointment.doctorId.toString());
    await deleteDoctorCalendarEvent({ doctor, eventId: appointment.googleEventId });
  }
  appointment.status = "cancelled";
  await appointment.save();
  return appointment;
};
