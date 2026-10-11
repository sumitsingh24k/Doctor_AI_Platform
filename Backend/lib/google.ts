import { google, calendar_v3 } from "googleapis";
import { Doctor } from "../modal/doctordetails.js";
import { getAgentContext } from "./requestContext.js";

const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"];
export const DEFAULT_TIME_ZONE =
  process.env.GOOGLE_CALENDAR_TIME_ZONE || "Asia/Kolkata";
const DEFAULT_APPOINTMENT_DURATION_MINUTES = Number(
  process.env.GOOGLE_CALENDAR_APPOINTMENT_DURATION_MINUTES || 30
);

export const getGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !redirectUri && "GOOGLE_REDIRECT_URI",
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    throw new Error(
      `Google Calendar OAuth is missing ${missing.join(", ")}. Add the value${missing.length > 1 ? "s" : ""} to Backend/.env and restart the backend.`
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

export const createDoctorGoogleAuthUrl = (doctorId: string) => {
  const oauth2Client = getGoogleOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    include_granted_scopes: true,
    state: doctorId,
  });
};

export const storeDoctorGoogleRefreshToken = async (
  doctorId: string,
  code: string
) => {
  const oauth2Client = getGoogleOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  const doctor = await Doctor.findById(doctorId);

  if (!doctor) {
    throw new Error("Doctor not found");
  }

  const refreshToken = tokens.refresh_token || doctor.googleRefreshToken || null;

  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Reconnect the doctor account and ensure offline access consent is granted."
    );
  }

  doctor.googleRefreshToken = refreshToken;
  await doctor.save();

  return doctor;
};

export const findConnectedDoctor = async (doctorId?: string) => {
  const context = getAgentContext();
  if (context) {
    if (doctorId && doctorId !== context.doctorId) {
      throw new Error("Doctor does not belong to this agent context");
    }
    const scopedDoctor = await Doctor.findOne({
      _id: context.doctorId,
      setupComplete: true,
      googleRefreshToken: { $type: "string", $ne: "" },
    });
    if (!scopedDoctor) {
      throw new Error("Clinic booking setup is incomplete or its Google Calendar is not connected");
    }
    return scopedDoctor;
  }

  if (doctorId) {
    const doctor = await Doctor.findOne({ _id: doctorId, setupComplete: true });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    if (!doctor.googleRefreshToken) {
      throw new Error("Clinic booking setup is not complete or Google Calendar is not connected");
    }

    return doctor;
  }

  throw new Error("A doctor ID is required to select a Google Calendar");
};

const parseAppointmentDate = (appointmentDate: unknown) => {
  if (typeof appointmentDate === "string") {
    const match = appointmentDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }
  }

  const parsed = new Date(appointmentDate as string | number | Date);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid appointment date");
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
};

const parseAppointmentTime = (appointmentTime: unknown) => {
  if (typeof appointmentTime !== "string") {
    throw new Error("Invalid appointment time");
  }

  const normalized = appointmentTime.trim().toUpperCase();
  const match = normalized.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/
  );

  if (!match) {
    throw new Error(
      "Unsupported appointment time format. Use HH:MM or HH:MM AM/PM."
    );
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const meridiem = match[4];

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      throw new Error("Invalid appointment time");
    }

    if (meridiem === "AM") {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
  }

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error("Invalid appointment time");
  }

  return { hours, minutes, seconds };
};

const getTimeZoneOffset = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  const asUTC = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUTC - date.getTime();
};

export const parseClockTime = (value: unknown, label: string) => {
  if (typeof value !== "string") {
    throw new Error(`${label} is invalid`);
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/
  );

  if (!match) {
    throw new Error(
      `${label} must be in HH:MM or HH:MM AM/PM format`
    );
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const meridiem = match[4];

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      throw new Error(`${label} is invalid`);
    }

    if (meridiem === "AM") {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
  }

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`${label} is invalid`);
  }

  return hours * 60 + minutes;
};

const getLocalMinutesOfDay = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return Number(values.hour) * 60 + Number(values.minute);
};

export const buildAppointmentWindow = (
  appointmentDate: unknown,
  appointmentTime: unknown,
  durationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES,
  timeZone = DEFAULT_TIME_ZONE
) => {
  const dateParts = parseAppointmentDate(appointmentDate);
  const timeParts = parseAppointmentTime(appointmentTime);

  const localDateTimeAsUtc = new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hours,
      timeParts.minutes,
      timeParts.seconds
    )
  );

  const offset = getTimeZoneOffset(localDateTimeAsUtc, timeZone);
  const start = new Date(localDateTimeAsUtc.getTime() - offset);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  return { start, end, timeZone };
};

export const checkClinicWorkingHours = (
  doctor: Awaited<ReturnType<typeof findConnectedDoctor>>,
  start: Date,
  end: Date,
  timeZone = doctor.clinicTimeZone || DEFAULT_TIME_ZONE
) => {
  const clinicOpeningTime = doctor.clinicOpeningTime;
  const clinicClosingTime = doctor.clinicClosingTime;

  if (!clinicOpeningTime || !clinicClosingTime) {
    return {
      isWithinClinicHours: false,
      timeZone,
      clinicOpeningTime: null,
      clinicClosingTime: null,
    };
  }

  const openingMinutes = parseClockTime(
    clinicOpeningTime,
    "Clinic opening time"
  );
  const closingMinutes = parseClockTime(
    clinicClosingTime,
    "Clinic closing time"
  );

  const appointmentStartMinutes = getLocalMinutesOfDay(start, timeZone);
  const appointmentEndMinutes = getLocalMinutesOfDay(end, timeZone);
  const isWithinClinicHours =
    closingMinutes > openingMinutes &&
    appointmentStartMinutes >= openingMinutes &&
    appointmentEndMinutes <= closingMinutes;

  return {
    isWithinClinicHours,
    timeZone,
    clinicOpeningTime,
    clinicClosingTime,
  };
};

export const getAvailableCalendarSlots = async ({
  doctor,
  appointmentDate,
  durationMinutes = doctor.appointmentDurationMinutes || 30,
}: {
  doctor: Awaited<ReturnType<typeof findConnectedDoctor>>;
  appointmentDate: string;
  durationMinutes?: number;
}) => {
  if (!doctor.clinicOpeningTime || !doctor.clinicClosingTime) {
    return [];
  }

  const openingMinutes = parseClockTime(
    doctor.clinicOpeningTime,
    "Clinic opening time"
  );
  const closingMinutes = parseClockTime(
    doctor.clinicClosingTime,
    "Clinic closing time"
  );
  const timeZone = doctor.clinicTimeZone || DEFAULT_TIME_ZONE;
  const slots: string[] = [];

  for (
    let minutes = openingMinutes;
    minutes + durationMinutes <= closingMinutes;
    minutes += durationMinutes
  ) {
    const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
    const slotMinutes = (minutes % 60).toString().padStart(2, "0");
    const appointmentTime = `${hours}:${slotMinutes}`;
    const { start, end } = buildAppointmentWindow(
      appointmentDate,
      appointmentTime,
      durationMinutes,
      timeZone
    );

    if (start <= new Date()) {
      continue;
    }

    const availability = await checkDoctorCalendarAvailability(
      doctor,
      start,
      end,
      timeZone
    );

    if (availability.isAvailable) {
      slots.push(appointmentTime);
    }
  }

  return slots;
};

export const checkDoctorCalendarAvailability = async (
  doctor: Awaited<ReturnType<typeof findConnectedDoctor>>,
  start: Date,
  end: Date,
  timeZone = DEFAULT_TIME_ZONE,
  excludeEventId?: string
) => {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: doctor.googleRefreshToken || null,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const calendarId = doctor.googleCalendarId || "primary";

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone,
      items: [{ id: calendarId }],
    },
  });

  let busySlots = response.data.calendars?.[calendarId]?.busy || [];

  if (excludeEventId && busySlots.length > 0) {
    const events = await calendar.events.list({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      showDeleted: false,
    });

    const hasOtherBusyEvent = (events.data.items || []).some(
      (event) => event.id !== excludeEventId && event.status !== "cancelled"
    );
    busySlots = hasOtherBusyEvent ? busySlots : [];
  }

  return {
    isAvailable: busySlots.length === 0,
    busySlots,
    calendarId,
    calendar,
  };
};

export const createDoctorCalendarEvent = async ({
  doctor,
  patientName,
  phoneNumber,
  appointmentDate,
  appointmentTime,
  appointmentId,
  durationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES,
}: {
  doctor: Awaited<ReturnType<typeof findConnectedDoctor>>;
  patientName: string;
  phoneNumber: string;
  appointmentDate: unknown;
  appointmentTime: unknown;
  appointmentId: string;
  durationMinutes?: number;
}) => {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: doctor.googleRefreshToken || null,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const calendarId = doctor.googleCalendarId || "primary";
  const { start, end, timeZone } = buildAppointmentWindow(
    appointmentDate,
    appointmentTime,
    durationMinutes,
    doctor.clinicTimeZone || DEFAULT_TIME_ZONE
  );

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Appointment with ${patientName}`,
      description: [
        `Patient Name: ${patientName}`,
        `Phone Number: ${phoneNumber}`,
        `Appointment ID: ${appointmentId}`,
      ].join("\n"),
      start: {
        dateTime: start.toISOString(),
        timeZone,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone,
      },
    } as calendar_v3.Schema$Event,
  });

  return event.data.id || null;
};

const getDoctorCalendar = (doctor: Awaited<ReturnType<typeof findConnectedDoctor>>) => {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: doctor.googleRefreshToken || null,
  });

  return {
    calendar: google.calendar({ version: "v3", auth: oauth2Client }),
    calendarId: doctor.googleCalendarId || "primary",
  };
};

export const updateDoctorCalendarEvent = async ({
  doctor,
  eventId,
  patientName,
  phoneNumber,
  appointmentDate,
  appointmentTime,
  appointmentId,
  durationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES,
}: {
  doctor: Awaited<ReturnType<typeof findConnectedDoctor>>;
  eventId: string;
  patientName: string;
  phoneNumber: string;
  appointmentDate: unknown;
  appointmentTime: unknown;
  appointmentId: string;
  durationMinutes?: number;
}) => {
  const { calendar, calendarId } = getDoctorCalendar(doctor);
  const { start, end, timeZone } = buildAppointmentWindow(
    appointmentDate,
    appointmentTime,
    durationMinutes,
    doctor.clinicTimeZone || DEFAULT_TIME_ZONE
  );

  const event = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: {
      summary: `Appointment with ${patientName}`,
      description: [
        `Patient Name: ${patientName}`,
        `Phone Number: ${phoneNumber}`,
        `Appointment ID: ${appointmentId}`,
      ].join("\n"),
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
    } as calendar_v3.Schema$Event,
  });

  return event.data.id || eventId;
};

export const deleteDoctorCalendarEvent = async ({
  doctor,
  eventId,
}: {
  doctor: Awaited<ReturnType<typeof findConnectedDoctor>>;
  eventId: string;
}) => {
  const { calendar, calendarId } = getDoctorCalendar(doctor);
  await calendar.events.delete({ calendarId, eventId });
};

export const listDoctorCalendarEvents = async ({
  doctor,
  start,
  end,
}: {
  doctor: Awaited<ReturnType<typeof findConnectedDoctor>>;
  start: Date;
  end: Date;
}) => {
  const { calendar, calendarId } = getDoctorCalendar(doctor);
  const response = await calendar.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
    showDeleted: false,
  });

  return (response.data.items || [])
    .filter((event) => event.status !== "cancelled")
    .map((event) => ({
      id: event.id || "",
      summary: event.summary || "Busy",
      start: event.start?.dateTime || event.start?.date || "",
      end: event.end?.dateTime || event.end?.date || "",
      allDay: Boolean(event.start?.date && !event.start?.dateTime),
    }));
};
