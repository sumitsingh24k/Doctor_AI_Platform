import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { normalizeAppointmentDate } from "./appointmentDate.js";
import { formatSpokenTime } from "./spokenFormatting.js";
import { getAvailableAppointmentRange } from "../services/appointment.service.js";

type ClinicDay = {
  date: string;
  slots: string[];
  bookedCount?: number;
  bookedTimes?: string[];
};

const isHindi = (message: string) =>
  /[\u0900-\u097F]/u.test(message) || /\b(kal|aaj|hai|kya|karo|kar|dekho|dikhao|kitni|batao|chahiye)\b/i.test(message);

const spokenDate = (dateValue: string, hindi: boolean) => {
  const today = normalizeAppointmentDate("today");
  const tomorrow = normalizeAppointmentDate("tomorrow");
  if (dateValue === today) return hindi ? "आज" : "today";
  if (dateValue === tomorrow) return hindi ? "कल" : "tomorrow";
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  return date.toLocaleDateString(hindi ? "hi-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};

const joinSpokenTimes = (times: string[], hindi: boolean) => {
  const spoken = times.map((time) => formatSpokenTime(time));
  const andWord = hindi ? "और" : "and";
  if (spoken.length <= 1) return spoken[0] ?? "";
  if (spoken.length === 2) return `${spoken[0]} ${andWord} ${spoken[1]}`;
  return `${spoken.slice(0, -1).join(", ")}, ${andWord} ${spoken[spoken.length - 1]}`;
};

const formatDaySpeech = (day: ClinicDay, hindi: boolean) => {
  const when = spokenDate(day.date, hindi);
  const bookedCount = day.bookedCount ?? day.bookedTimes?.length ?? 0;
  const openTimes = (day.slots ?? []).slice(0, 4);
  if (!bookedCount && openTimes.length === 0) {
    return hindi ? `${when} कोई स्लॉट उपलब्ध नहीं है।` : `${when} has no open appointment times.`;
  }
  const bookedPart = bookedCount
    ? hindi
      ? `${when} ${bookedCount} अपॉइंटमेंट बुक हैं`
      : `${when} has ${bookedCount} booked appointment${bookedCount === 1 ? "" : "s"}`
    : hindi
      ? `${when} अभी कोई अपॉइंटमेंट बुक नहीं है`
      : `${when} has no booked appointments yet`;
  if (!openTimes.length) {
    return hindi ? `${bookedPart}, और खाली स्लॉट नहीं बचे हैं।` : `${bookedPart}, and no open slots remain.`;
  }
  const slots = joinSpokenTimes(openTimes, hindi);
  return hindi
    ? `${bookedPart}. खुले समय हैं ${slots}.`
    : `${bookedPart}. Open times include ${slots}.`;
};

export const formatScheduleSpeech = (
  result: { days?: ClinicDay[]; date?: string; slots?: string[]; bookedCount?: number; bookedTimes?: string[] },
  message: string
) => {
  const hindi = isHindi(message);
  const days: ClinicDay[] = result.days?.length
    ? result.days
    : result.date
      ? [{
          date: result.date,
          slots: result.slots ?? [],
          ...(result.bookedCount !== undefined ? { bookedCount: result.bookedCount } : {}),
          ...(result.bookedTimes ? { bookedTimes: result.bookedTimes } : {}),
        }]
      : [];
  if (!days.length) return hindi ? "उस तारीख के लिए शेड्यूल नहीं मिल सका।" : "I could not find the schedule for that date.";
  return days.slice(0, 3).map((day) => formatDaySpeech(day, hindi)).join(" ");
};

const looksLikeBookingAction = (text: string) =>
  /\b(book|booking|cancel|reschedule|move|shift|confirm|mera naam|my name|phone|number|बुक|कैंसल|रद्द|शिफ्ट)\b/i.test(text);

export const detectScheduleLookup = (message: string) => {
  const text = message.trim();
  if (!text || looksLikeBookingAction(text)) return undefined;
  const hasAppointment = /\b(appointment|apointment|appoinment|slot|slots|schedule|timing|उपलब्ध|अपॉइंटमेंट|अपॉइन्टमेंट|स्लॉट)\b/i.test(text);
  const hasLookup = /\b(check|show|list|available|availability|free|open|hai kya|dekho|dikhao|batao|kitni|kab|khaali|khali|khula)\b/i.test(text)
    || /[\u0900-\u097F].*(देख|दिखा|बता|चेक|है क्या|कितनी|खाली)/u.test(text);
  if (!hasAppointment && !hasLookup) return undefined;
  if (!hasAppointment && !/\b(kal|aaj|tomorrow|today|परसों|कल|आज)\b/i.test(text) && !/[\u0900-\u097F]/u.test(text)) {
    return undefined;
  }
  const wantsWeek = /\b(week|7 days|saat din|this week|पूरे हफ्ते|हफ्ते)\b/i.test(text);
  const date = normalizeAppointmentDate(text) ?? normalizeAppointmentDate("today");
  return { date, days: wantsWeek ? 7 : 1 };
};

export const getScheduleFastReply = async (message: string) => {
  const lookup = detectScheduleLookup(message);
  if (!lookup?.date) return undefined;
  const result = await getAvailableAppointmentRange(lookup.date, lookup.days);
  return formatScheduleSpeech(result, message);
};

// A request such as "I want to book tomorrow" is common in both text and
// voice. It contains a date but is intentionally excluded from the generic
// schedule lookup above. Resolve it from the live calendar before asking an
// LLM so a provider outage never turns this simple request into a blank reply.
export const getBookingAvailabilityFastReply = async (message: string) => {
  const text = message.trim();
  if (!/\b(book|booking|appointment|appoinment|apointment|\u092c\u0941\u0915)\b/i.test(text)) return undefined;
  const date = normalizeAppointmentDate(text);
  if (!date) return undefined;
  const result = await getAvailableAppointmentRange(date, 1);
  return formatScheduleSpeech(result, message);
};

const formatMutationSpeech = (name: string, content: string) => {
  try {
    const payload = JSON.parse(content) as {
      message?: string;
      appointmentDate?: string;
      appointmentTime?: string;
      status?: string;
      error?: string;
    };
    if (payload.error) return payload.error;
    const time = payload.appointmentTime ? formatSpokenTime(payload.appointmentTime) : "";
    const date = payload.appointmentDate ? spokenDate(payload.appointmentDate, false) : "";
    if (name === "book_appointment") return `Your appointment is booked${date ? ` for ${date}` : ""}${time ? ` at ${time}` : ""}.`;
    if (name === "reschedule_appointment") return `Your appointment is rescheduled${date ? ` to ${date}` : ""}${time ? ` at ${time}` : ""}.`;
    if (name === "cancel_appointment") return "Your appointment has been cancelled.";
    return payload.message;
  } catch {
    return undefined;
  }
};

export const formatToolResultSpeech = (messages: BaseMessage[], latestUserMessage: string) => {
  const trailing: ToolMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message instanceof ToolMessage) trailing.unshift(message);
    else break;
  }
  if (!trailing.length) return undefined;
  if (trailing.some((message) => message.name === "search_doctor_knowledge")) return undefined;

  const scheduleTool = trailing.find((message) => message.name === "get_available_appointment_slots");
  if (scheduleTool && typeof scheduleTool.content === "string") {
    try {
      return formatScheduleSpeech(JSON.parse(scheduleTool.content), latestUserMessage);
    } catch {
      return undefined;
    }
  }

  const mutation = trailing.find((message) =>
    message.name === "book_appointment" || message.name === "reschedule_appointment" || message.name === "cancel_appointment"
  );
  if (mutation && typeof mutation.content === "string") {
    return formatMutationSpeech(mutation.name ?? "", mutation.content);
  }
  return undefined;
};

export const spokenToolReply = (messages: BaseMessage[], latestUserMessage: string) => {
  const text = formatToolResultSpeech(messages, latestUserMessage);
  return text ? [new AIMessage(text)] : undefined;
};

export const latestHumanText = (messages: BaseMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message instanceof HumanMessage) {
      return typeof message.content === "string" ? message.content : "";
    }
  }
  return "";
};
