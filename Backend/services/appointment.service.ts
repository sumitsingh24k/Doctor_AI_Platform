import {
  DEFAULT_TIME_ZONE,
  findConnectedDoctor,
  getAvailableCalendarSlots,
} from "../lib/google.js";
import { isAppointmentDateInPast, isWithinBookingWindow, normalizeAppointmentDate } from "../lib/appointmentDate.js";

const isValidAppointmentDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

export const getAvailableAppointmentSlots = async (appointmentDate: string, doctorId?: string) => {
  const normalizedDate = normalizeAppointmentDate(appointmentDate);
  if (!normalizedDate || !isValidAppointmentDate(normalizedDate)) {
    throw new Error("Please provide a valid appointment date, for example 15 September or tomorrow");
  }
  if (isAppointmentDateInPast(normalizedDate)) {
    throw new Error("Appointments cannot be checked for a past date");
  }
  if (!isWithinBookingWindow(normalizedDate)) {
    throw new Error("Availability is only provided for the next 7 days");
  }

  const doctor = await findConnectedDoctor(doctorId);
  const appointmentDurationMinutes = doctor.appointmentDurationMinutes || 30;
  const slots = await getAvailableCalendarSlots({
    doctor,
    appointmentDate: normalizedDate,
    durationMinutes: appointmentDurationMinutes,
  });

  return {
    date: normalizedDate,
    timeZone: doctor.clinicTimeZone || DEFAULT_TIME_ZONE,
    appointmentDurationMinutes,
    slots,
    // Keep suggestions deterministic: these are confirmed available slots from
    // Google Calendar, ordered chronologically, not times invented by the LLM.
    suggestedSlots: slots.slice(0, 3),
  };
};

export const getAvailableAppointmentWeek = async (appointmentDate?: string) => {
  const startDate = normalizeAppointmentDate(appointmentDate ?? "today");
  if (!startDate || !isValidAppointmentDate(startDate)) {
    throw new Error("Please provide a valid appointment date, for example today or tomorrow");
  }
  if (isAppointmentDateInPast(startDate)) {
    throw new Error("Appointments cannot be checked for a past date");
  }
  if (!isWithinBookingWindow(startDate)) {
    throw new Error("Availability is only provided for the next 7 days");
  }

  const doctor = await findConnectedDoctor();
  const appointmentDurationMinutes = doctor.appointmentDurationMinutes || 30;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const days: Array<{ date: string; slots: string[] }> = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
    const dateValue = date.toISOString().slice(0, 10);
    const slots = await getAvailableCalendarSlots({
      doctor,
      appointmentDate: dateValue,
      durationMinutes: appointmentDurationMinutes,
    });
    if (slots.length > 0) days.push({ date: dateValue, slots });
  }

  return {
    from: startDate,
    through: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    timeZone: doctor.clinicTimeZone || DEFAULT_TIME_ZONE,
    appointmentDurationMinutes,
    days,
    suggestedSlots: days.flatMap(({ date, slots }) => slots.slice(0, 3).map((time) => ({ date, time }))).slice(0, 6),
  };
};
