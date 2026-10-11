import { Request, Response } from "express";
import Appointment from "../modal/appointmentschema.js";
import Patient from "../modal/patientschema.js";
import User from "../modal/userschema.js";
import {
  DEFAULT_TIME_ZONE,
  buildAppointmentWindow,
  checkClinicWorkingHours,
  checkDoctorCalendarAvailability,
  createDoctorCalendarEvent,
  deleteDoctorCalendarEvent,
  findConnectedDoctor,
  getAvailableCalendarSlots,
  updateDoctorCalendarEvent,
} from "../lib/google.js";
import { getAvailableAppointmentSlots } from "../services/appointment.service.js";
import { isAppointmentDateInPast, isWithinBookingWindow, normalizeAppointmentDate } from "../lib/appointmentDate.js";
import { getAgentContext } from "../lib/requestContext.js";

const normalizePhoneNumber = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/[\s()-]/g, "") : "";

const normalizeName = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const isValidPhoneNumber = (phoneNumber: string) =>
  /^\+?[0-9]{7,15}$/.test(phoneNumber);

const isValidAppointmentDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const getAppointmentDateQuery = (appointmentDate: string) => {
  const start = new Date(`${appointmentDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { $gte: start, $lt: end };
};

const doctorFilter = () => {
  const context = getAgentContext();
  return context ? { doctorId: context.doctorId } : {};
};

export const Bookappointment = async (req: Request, res: Response) => {
  try {
    const {
      patientName,
      phoneNumber,
      appointmentDate,
      appointmentTime,
      email,
      address,
      medicalHistory,
      doctorId,
    } = req.body;
    const account = req.user?.role === "patient"
      ? await User.findById(req.user.userId).select("email name")
      : null;
    if (req.user?.role === "patient" && !account) {
      return res.status(401).json({ message: "Patient account is no longer available" });
    }

    const normalizedName = normalizeName(account?.name ?? patientName);
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const patientEmail = account?.email ?? (typeof email === "string" ? email.trim().toLowerCase() : "");

    if (
      normalizedName.length < 2 ||
      normalizedPhoneNumber.length === 0 ||
      !isValidPhoneNumber(normalizedPhoneNumber) ||
      !isValidAppointmentDate(appointmentDate) ||
      typeof appointmentTime !== "string" ||
      !appointmentTime.trim()
    ) {
      return res.status(400).json({
        message: "Valid patient name, phone number, date and time are required",
      });
    }
    const normalizedAppointmentDate = normalizeAppointmentDate(appointmentDate);
    if (!normalizedAppointmentDate || !isWithinBookingWindow(normalizedAppointmentDate)) {
      return res.status(400).json({ message: "Appointments can only be booked within the next 7 days" });
    }

    // This application currently has one doctor, so patients do not need to
    // provide a doctor ID. The connected doctor is selected automatically.
    const agentDoctorId = getAgentContext()?.doctorId;
    if (agentDoctorId && typeof doctorId === "string" && doctorId !== agentDoctorId) {
      return res.status(403).json({ message: "You cannot book an appointment for another clinic through this assistant" });
    }
    const requestedDoctorId = agentDoctorId ?? (typeof doctorId === "string" ? doctorId.trim() : "");
    if (!requestedDoctorId) {
      return res.status(400).json({ message: "A doctorId is required to book an appointment" });
    }
    if (!/^[a-f\d]{24}$/i.test(requestedDoctorId)) {
      return res.status(400).json({ message: "A valid doctorId is required" });
    }
    const doctor = await findConnectedDoctor(requestedDoctorId);
    const appointmentDurationMinutes = doctor.appointmentDurationMinutes || 30;
    const { start, end, timeZone } = buildAppointmentWindow(
      appointmentDate,
      appointmentTime,
      appointmentDurationMinutes,
      doctor.clinicTimeZone || DEFAULT_TIME_ZONE
    );

    if (start <= new Date()) {
      return res.status(400).json({
        message: "Appointment must be scheduled for a future time",
      });
    }

    const clinicAvailability = checkClinicWorkingHours(
      doctor,
      start,
      end
    );

    if (!clinicAvailability.isWithinClinicHours) {
      return res.status(409).json({
        message: "Currently the clinic is not available at this time slot",
      });
    }

    const availability = await checkDoctorCalendarAvailability(
      doctor,
      start,
      end,
      timeZone
    );

    if (!availability.isAvailable) {
      return res.status(409).json({
        message: "This appointment slot is not available on Google Calendar",
      });
    }

    const existingAppointment = await Appointment.findOne({
      ...doctorFilter(),
      doctorId: doctor._id,
      appointmentDate: getAppointmentDateQuery(normalizedAppointmentDate),
      appointmentTime: appointmentTime.trim(),
      status: "booked",
    });

    if (existingAppointment) {
      return res.status(409).json({
        message: "This appointment slot is already booked",
      });
    }

    let patient = await Patient.findOne({ doctorId: doctor._id, phoneNumber: normalizedPhoneNumber });

    if (patient && patient.name.toLowerCase() !== normalizedName.toLowerCase()) {
      return res.status(409).json({
        message: "This phone number is already registered with another patient",
      });
    }

    if (patient && req.user?.role === "patient" && patient.userId && patient.userId.toString() !== req.user.userId) {
      return res.status(409).json({
        message: "This phone number is already linked to another patient account",
      });
    }
    if (patient && account && !patient.userId) {
      return res.status(409).json({
        message: "This phone number is already on file. Please contact the clinic to link your patient record.",
      });
    }

    if (!patient) {
      patient = new Patient({
        doctorId: doctor._id,
        ...(account ? { userId: account._id } : {}),
        name: normalizedName,
        phoneNumber: normalizedPhoneNumber,
        email: patientEmail,
        address: typeof address === "string" ? address.trim() : "",
        medicalHistory:
          typeof medicalHistory === "string" ? medicalHistory.trim() : "",
      });
      await patient.save();
    }

    const patientProfile = new Appointment({
      ...doctorFilter(),
      doctorId: doctor._id,
      patientId: patient._id,
      patientName: normalizedName,
      phoneNumber: normalizedPhoneNumber,
      appointmentDate: normalizedAppointmentDate,
      appointmentTime: appointmentTime.trim(),
      status: "booked",
      // Follow-up appointments are created by the doctor through the revisit API.
      visitType: "new",
    });

    const googleEventId = await createDoctorCalendarEvent({
      doctor,
      patientName: normalizedName,
      phoneNumber: normalizedPhoneNumber,
      appointmentDate: normalizedAppointmentDate,
      appointmentTime,
      appointmentId: patientProfile._id.toString(),
      durationMinutes: appointmentDurationMinutes,
    });

    if (!googleEventId) {
      return res.status(502).json({
        message: "Google Calendar event was created but no event id was returned",
      });
    }

    patientProfile.googleEventId = googleEventId;

    await patientProfile.save();

    return res.status(201).json({
      message: "Appointment booked successfully",
      patient: patientProfile,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getAppointmentAvailability = async (req: Request, res: Response) => {
  try {
    const appointmentDate = req.query.date;
    const normalizedDate = normalizeAppointmentDate(appointmentDate);

    if (!normalizedDate || !isValidAppointmentDate(normalizedDate)) {
      return res.status(400).json({
        message: "Please provide a valid appointment date, for example 15 September or tomorrow",
      });
    }
    if (isAppointmentDateInPast(normalizedDate)) {
      return res.status(400).json({ message: "Appointments cannot be checked for a past date" });
    }
    if (!isWithinBookingWindow(normalizedDate)) {
      return res.status(400).json({ message: "Availability is only provided for the next 7 days" });
    }

    const doctorId = typeof req.query.doctorId === "string" ? req.query.doctorId : undefined;
    const agentDoctorId = getAgentContext()?.doctorId;
    if (agentDoctorId && doctorId && doctorId !== agentDoctorId) {
      return res.status(403).json({ message: "You cannot check availability for another clinic through this assistant" });
    }
    const requestedDoctorId = agentDoctorId ?? doctorId?.trim();
    if (!requestedDoctorId) return res.status(400).json({ message: "A doctorId is required to check appointment availability" });
    if (!/^[a-f\d]{24}$/i.test(requestedDoctorId)) return res.status(400).json({ message: "A valid doctorId is required" });
    const availability = await getAvailableAppointmentSlots(normalizedDate, requestedDoctorId);
    return res.status(200).json(availability);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to get appointment availability" });
  }
};


export const RescheduleAppointment = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      appointmentId,
      patientName,
      phoneNumber,
      appointmentDate,
      appointmentTime,
    } = req.body;

    const normalizedName = normalizeName(patientName);
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (
      !appointmentId ||
      normalizedName.length < 2 ||
      !isValidPhoneNumber(normalizedPhoneNumber) ||
      !isValidAppointmentDate(appointmentDate) ||
      typeof appointmentTime !== "string" ||
      !appointmentTime.trim()
    ) {
      return res.status(400).json({
        message: "Appointment ID, patient name, phone number, date and time are required",
      });
    }

    const normalizedAppointmentDate = normalizeAppointmentDate(appointmentDate);
    if (!normalizedAppointmentDate || !isWithinBookingWindow(normalizedAppointmentDate)) {
      return res.status(400).json({ message: "Appointments can only be rescheduled within the next 7 days" });
    }

    const appointment = await Appointment.findOne({ ...doctorFilter(), _id: appointmentId });

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({
        message: "Cancelled appointment cannot be rescheduled",
      });
    }

    if (
      appointment.patientName.toLowerCase() !== normalizedName.toLowerCase() ||
      normalizePhoneNumber(appointment.phoneNumber) !== normalizedPhoneNumber
    ) {
      return res.status(403).json({
        message: "Patient details do not match this appointment",
      });
    }

    if (!appointment.doctorId) {
      return res.status(400).json({
        message: "Appointment is not linked to a doctor profile",
      });
    }

    const doctor = await findConnectedDoctor(appointment.doctorId.toString());
    const appointmentDurationMinutes = doctor.appointmentDurationMinutes || 30;
    const { start, end, timeZone } = buildAppointmentWindow(
      normalizedAppointmentDate,
      appointmentTime,
      appointmentDurationMinutes,
      doctor.clinicTimeZone || DEFAULT_TIME_ZONE
    );

    if (start <= new Date()) {
      return res.status(400).json({
        message: "Appointment must be scheduled for a future time",
      });
    }

    const clinicAvailability = checkClinicWorkingHours(
      doctor,
      start,
      end
    );

    if (!clinicAvailability.isWithinClinicHours) {
      return res.status(409).json({
        message: "Currently the clinic is not available at this time slot",
      });
    }

    const availability = await checkDoctorCalendarAvailability(
      doctor,
      start,
      end,
      timeZone,
      appointment.googleEventId || undefined
    );

    if (!availability.isAvailable) {
      return res.status(409).json({
        message: "This appointment slot is not available on Google Calendar",
      });
    }

    const conflictingAppointment = await Appointment.findOne({
      ...doctorFilter(),
      _id: { $ne: appointment._id },
      doctorId: appointment.doctorId,
      appointmentDate: getAppointmentDateQuery(normalizedAppointmentDate),
      appointmentTime: appointmentTime.trim(),
      status: "booked",
    });

    if (conflictingAppointment) {
      return res.status(409).json({
        message: "This appointment slot is already booked",
      });
    }

    if (appointment.googleEventId) {
      try {
        await updateDoctorCalendarEvent({
          doctor,
          eventId: appointment.googleEventId,
          patientName: appointment.patientName,
          phoneNumber: appointment.phoneNumber,
          appointmentDate: normalizedAppointmentDate,
          appointmentTime: appointmentTime.trim(),
          appointmentId: appointment._id.toString(),
          durationMinutes: appointmentDurationMinutes,
        });
      } catch (error) {
        console.error(error);
        return res.status(502).json({
          message: "Unable to update the Google Calendar appointment",
        });
      }
    }

    appointment.appointmentDate = new Date(`${normalizedAppointmentDate}T00:00:00.000Z`);
    appointment.appointmentTime = appointmentTime.trim();

    await appointment.save();

    return res.status(200).json({
      message: "Appointment rescheduled successfully",
      appointment,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};


export const CancelAppointment = async (
  req: Request,
  res: Response
) => {
  try {
    const { appointmentId, patientName, phoneNumber } = req.body;
    const normalizedName = normalizeName(patientName);
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!appointmentId || normalizedName.length < 2 || !isValidPhoneNumber(normalizedPhoneNumber)) {
      return res.status(400).json({
        message: "Appointment ID, patient name and phone number are required",
      });
    }

    const appointment = await Appointment.findOne({ ...doctorFilter(), _id: appointmentId });

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    if (
      appointment.patientName.toLowerCase() !== normalizedName.toLowerCase() ||
      normalizePhoneNumber(appointment.phoneNumber) !== normalizedPhoneNumber
    ) {
      return res.status(403).json({
        message: "Patient details do not match this appointment",
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(409).json({
        message: "Appointment is already cancelled",
      });
    }

    if (appointment.googleEventId && appointment.doctorId) {
      try {
        const doctor = await findConnectedDoctor(appointment.doctorId.toString());
        await deleteDoctorCalendarEvent({
          doctor,
          eventId: appointment.googleEventId,
        });
      } catch (error) {
        console.error(error);
        return res.status(502).json({
          message: "Unable to cancel the Google Calendar appointment",
        });
      }
    }

    appointment.status = "cancelled";

    await appointment.save();

    return res.status(200).json({
      message: "Appointment cancelled successfully",
      appointment,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};



export const getAllPatientAppointments = async (req: Request, res: Response) => {
  try {
    let appointments;
    if (req.user?.role === "patient") {
      const user = await User.findById(req.user.userId).select("_id");
      if (!user) return res.status(404).json({ message: "Patient account not found" });
      const patients = await Patient.find({
        ...doctorFilter(),
        userId: user._id,
      }).select("_id");
      appointments = await Appointment.find({
        ...doctorFilter(),
        patientId: { $in: patients.map((patient) => patient._id) },
      }).sort({ appointmentDate: 1, appointmentTime: 1 });
    } else {
      appointments = await Appointment.find(doctorFilter())
        .populate("patientId")
        .sort({ appointmentDate: 1, appointmentTime: 1 });
    }

    return res.status(200).json({ appointments });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllPatients = async (_req: Request, res: Response) => {
  try {
    const patients = await Patient.find(doctorFilter()).sort({ name: 1 });
    return res.status(200).json({ patients });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getPatient = async (req: Request, res: Response) => {
  try {
    const patient = await Patient.findOne({ ...doctorFilter(), _id: req.params.patientId });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const appointments = await Appointment.find({ ...doctorFilter(), patientId: patient._id })
      .sort({ appointmentDate: -1, appointmentTime: -1 });

    return res.status(200).json({ patient, appointments });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const findPatientByPhone = async (req: Request, res: Response) => {
  try {
    const phoneNumber = normalizePhoneNumber(req.params.phoneNumber);

    if (!isValidPhoneNumber(phoneNumber)) {
      return res.status(400).json({ message: "Valid phone number is required" });
    }

    const patient = await Patient.findOne({ ...doctorFilter(), phoneNumber });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const appointments = await Appointment.find({ ...doctorFilter(), patientId: patient._id })
      .sort({ appointmentDate: -1, appointmentTime: -1 });

    return res.status(200).json({ patient, appointments });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const completeAppointment = async (req: Request, res: Response) => {
  try {
    const appointment = await Appointment.findOne({ ...doctorFilter(), _id: req.params.appointmentId });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.status === "cancelled") {
      return res.status(409).json({ message: "Cancelled appointment cannot be completed" });
    }

    appointment.status = "completed";
    if (typeof req.body.notes === "string") {
      appointment.notes = req.body.notes.trim();
    }
    await appointment.save();

    return res.status(200).json({ message: "Visit completed successfully", appointment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createDoctorRevisit = async (req: Request, res: Response) => {
  try {
    const { patientId, appointmentDate, appointmentTime, notes } = req.body;

    if (
      !patientId ||
      !isValidAppointmentDate(appointmentDate) ||
      typeof appointmentTime !== "string" ||
      !appointmentTime.trim()
    ) {
      return res.status(400).json({
        message: "Patient ID, valid future date and appointment time are required",
      });
    }

    const patient = await Patient.findOne({ ...doctorFilter(), _id: patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const doctor = await findConnectedDoctor();
    const appointmentDurationMinutes = doctor.appointmentDurationMinutes || 30;
    const { start, end, timeZone } = buildAppointmentWindow(
      appointmentDate,
      appointmentTime,
      appointmentDurationMinutes,
      doctor.clinicTimeZone || DEFAULT_TIME_ZONE
    );

    if (start <= new Date()) {
      return res.status(400).json({ message: "Revisit must be scheduled for a future time" });
    }

    if (!checkClinicWorkingHours(doctor, start, end).isWithinClinicHours) {
      return res.status(409).json({
        message: "Currently the clinic is not available at this time slot",
      });
    }

    const availability = await checkDoctorCalendarAvailability(
      doctor,
      start,
      end,
      timeZone
    );
    if (!availability.isAvailable) {
      return res.status(409).json({
        message: "This appointment slot is not available on Google Calendar",
      });
    }

    const appointmentTimeValue = appointmentTime.trim();
    const existingAppointment = await Appointment.findOne({
      ...doctorFilter(),
      doctorId: doctor._id,
      appointmentDate: getAppointmentDateQuery(appointmentDate),
      appointmentTime: appointmentTimeValue,
      status: "booked",
    });

    if (existingAppointment) {
      return res.status(409).json({ message: "This appointment slot is already booked" });
    }

    const appointment = new Appointment({
      ...doctorFilter(),
      doctorId: doctor._id,
      patientId: patient._id,
      patientName: patient.name,
      phoneNumber: patient.phoneNumber,
      appointmentDate,
      appointmentTime: appointmentTimeValue,
      visitType: "follow-up",
      notes: typeof notes === "string" ? notes.trim() : "",
      status: "booked",
    });

    const googleEventId = await createDoctorCalendarEvent({
      doctor,
      patientName: patient.name,
      phoneNumber: patient.phoneNumber,
      appointmentDate,
      appointmentTime: appointmentTimeValue,
      appointmentId: appointment._id.toString(),
      durationMinutes: appointmentDurationMinutes,
    });

    if (!googleEventId) {
      return res.status(502).json({ message: "Unable to create Google Calendar revisit" });
    }

    appointment.googleEventId = googleEventId;
    await appointment.save();

    return res.status(201).json({
      message: "Revisit scheduled successfully",
      appointment,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
