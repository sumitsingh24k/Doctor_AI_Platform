import Appointment from "../modal/appointmentschema.js";
import {
  DEFAULT_TIME_ZONE,
  findConnectedDoctor,
  getAvailableCalendarSlots,
  getAvailableCalendarSlotsForDates,
} from "../lib/google.js";
import { isAppointmentDateInPast, isWithinBookingWindow, normalizeAppointmentDate } from "../lib/appointmentDate.js";

const isValidAppointmentDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const addUtcDays = (dateValue: string, offset: number) => {
  const start = new Date(`${dateValue}T00:00:00.000Z`);
  return new Date(start.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

const dateRange = (from: string, dayCount: number) =>
  Array.from({ length: dayCount }, (_, offset) => addUtcDays(from, offset)).filter((date) => isWithinBookingWindow(date));

const appointmentDateBounds = (from: string, through: string) => {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${addUtcDays(through, 1)}T00:00:00.000Z`);
  return { start, end };
};

const loadBookedTimes = async (doctorId: string, from: string, through: string) => {
  const { start, end } = appointmentDateBounds(from, through);
  const appointments = await Appointment.find({
    doctorId,
    appointmentDate: { $gte: start, $lt: end },
    status: "booked",
  })
    .select("appointmentDate appointmentTime")
    .sort({ appointmentDate: 1, appointmentTime: 1 })
    .lean();

  const bookedByDate = new Map<string, string[]>();
  for (const appointment of appointments) {
    const dateValue = new Date(appointment.appointmentDate).toISOString().slice(0, 10);
    const times = bookedByDate.get(dateValue) ?? [];
    times.push(appointment.appointmentTime);
    bookedByDate.set(dateValue, times);
  }
  return bookedByDate;
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
  const [slots, bookedByDate] = await Promise.all([
    getAvailableCalendarSlots({
      doctor,
      appointmentDate: normalizedDate,
      durationMinutes: appointmentDurationMinutes,
    }),
    loadBookedTimes(doctor._id.toString(), normalizedDate, normalizedDate),
  ]);
  const bookedTimes = bookedByDate.get(normalizedDate) ?? [];

  return {
    date: normalizedDate,
    timeZone: doctor.clinicTimeZone || DEFAULT_TIME_ZONE,
    appointmentDurationMinutes,
    slots,
    bookedCount: bookedTimes.length,
    bookedTimes,
    suggestedSlots: slots.slice(0, 3),
  };
};

export const getAvailableAppointmentRange = async (appointmentDate?: string, dayCount = 1) => {
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

  const requestedDays = Math.min(Math.max(Math.trunc(dayCount) || 1, 1), 7);
  const dates = dateRange(startDate, requestedDays);
  const doctor = await findConnectedDoctor();
  const appointmentDurationMinutes = doctor.appointmentDurationMinutes || 30;
  const through = dates[dates.length - 1] ?? startDate;
  const [slotDays, bookedByDate] = await Promise.all([
    getAvailableCalendarSlotsForDates({
      doctor,
      dates,
      durationMinutes: appointmentDurationMinutes,
    }),
    loadBookedTimes(doctor._id.toString(), startDate, through),
  ]);

  const days = slotDays.map(({ date, slots }) => ({
    date,
    slots,
    bookedCount: bookedByDate.get(date)?.length ?? 0,
    bookedTimes: bookedByDate.get(date) ?? [],
  }));

  return {
    from: startDate,
    through,
    timeZone: doctor.clinicTimeZone || DEFAULT_TIME_ZONE,
    appointmentDurationMinutes,
    days,
    suggestedSlots: days.flatMap(({ date, slots }) => slots.slice(0, 3).map((time) => ({ date, time }))).slice(0, 6),
  };
};

export const getAvailableAppointmentWeek = async (appointmentDate?: string) =>
  getAvailableAppointmentRange(appointmentDate, 7);
