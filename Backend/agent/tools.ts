import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchDoctorKnowledgeForAssistant } from "../controller/knowledgecontroller.js";
import { getAvailableAppointmentRange } from "../services/appointment.service.js";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "../services/appointment-actions.service.js";
import { normalizeAppointmentDate } from "../lib/appointmentDate.js";
import { getAgentContext } from "../lib/requestContext.js";
import { formatSpokenTime, getSpokenTimeZoneName } from "../lib/spokenFormatting.js";
import { Doctor } from "../modal/doctordetails.js";
import { AssistantActionAudit } from "../modal/assistantActionAudit.js";

const recordAssistantAction = (input: {
  action: "book" | "reschedule" | "cancel";
  outcome: "succeeded" | "failed";
  appointmentId?: string;
  error?: unknown;
}) => {
  const context = getAgentContext();
  if (!context) return;
  const error = input.error as { statusCode?: unknown } | undefined;
  void AssistantActionAudit.create({
    threadId: context.threadId,
    doctorId: context.doctorId,
    action: input.action,
    outcome: input.outcome,
    ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
    ...(typeof error?.statusCode === "number" ? { errorCode: error.statusCode } : {}),
    ...(input.error instanceof Error ? { errorMessage: input.error.message.slice(0, 500) } : {}),
  }).catch((auditError: unknown) => console.warn("assistant.action_audit.failed", { errorName: auditError instanceof Error ? auditError.name : "UnknownError" }));
};

export const getDoctorClinicDetailsTool = tool(
  async () => {
    const context = getAgentContext();
    if (!context?.doctorId) return JSON.stringify({ error: "Clinic context is unavailable" });
    const doctor = await Doctor.findById(context.doctorId).select(
      "name specialization qualification clinicName clinicAddress aboutDoctor clinicOpeningTime clinicClosingTime clinicTimeZone appointmentDurationMinutes"
    ).lean();
    if (!doctor) return JSON.stringify({ error: "Clinic profile not found" });

    return JSON.stringify({
      doctorName: doctor.name,
      specialization: doctor.specialization,
      qualification: doctor.qualification,
      clinicName: doctor.clinicName,
      clinicAddress: doctor.clinicAddress,
      aboutDoctor: doctor.aboutDoctor,
      openingTime: formatSpokenTime(doctor.clinicOpeningTime),
      closingTime: formatSpokenTime(doctor.clinicClosingTime),
      localTimeZoneName: getSpokenTimeZoneName(doctor.clinicTimeZone),
      appointmentDurationMinutes: doctor.appointmentDurationMinutes,
    });
  },
  {
    name: "get_doctor_clinic_details",
    description:
      "Get verified public facts for the selected clinic. Use only facts that answer the patient's question: hours questions need opening and closing time only; doctor identity questions need name and specialty, with qualifications only when relevant; duration questions need duration only. Times are already formatted for speech. Never read the entire result aloud or return another clinic's details.",
    schema: z.object({}),
  }
);

export const searchDoctorKnowledgeTool = tool(
  async ({ query }) => {
    const result = await searchDoctorKnowledgeForAssistant({ query, topK: 3 });

    return JSON.stringify({
      context: result.context,
      sources: result.matches.map((match) => ({
        fileName: match.sourceFileName,
        sourceUrl: match.sourceUrl,
      })),
    });
  },
  {
    name: "search_doctor_knowledge",
    description:
      "Search the doctor's approved clinic documents for services, timings, fees, locations, and other clinic information. Do not use this tool to diagnose or prescribe.",
    schema: z.object({
      query: z.string().min(1).describe("The patient's question to search for"),
    }),
  }
);

export const getAvailableSlotsTool = tool(
  async ({ date, days }) => {
    const result = await getAvailableAppointmentRange(date, days ?? 1);
    return JSON.stringify({
      from: result.from,
      through: result.through,
      appointmentDurationMinutes: result.appointmentDurationMinutes,
      clinicLocalTimeZoneName: getSpokenTimeZoneName(result.timeZone),
      days: result.days.map(({ date: slotDate, slots, bookedCount, bookedTimes }) => ({
        date: slotDate,
        bookedCount,
        bookedTimes: bookedTimes.map((time) => formatSpokenTime(time)),
        slots: slots.map((slot) => formatSpokenTime(slot)),
      })),
      suggestedSlots: result.suggestedSlots.map(({ date: slotDate, time }) => ({
        date: slotDate,
        time: formatSpokenTime(time),
      })),
    });
  },
  {
    name: "get_available_appointment_slots",
    description:
      "Get booked appointment counts and genuinely available open slots. Default to one day: the date the patient named, or today. Use days=7 only when they ask about the week. Offer only a few open slots. Never invent slots or speak other patients' names. Hindi words like kal and aaj are valid dates.",
    schema: z.object({
      date: z.string().optional().transform((value) => value ? normalizeAppointmentDate(value) : undefined).refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Please provide a valid appointment date, for example 15 September, tomorrow, or kal"),
      days: z.coerce.number().int().min(1).max(7).optional().describe("Number of days to check, starting from date. Use 1 unless the patient asked about the week."),
    }),
  }
);

export const bookAppointmentTool = tool(
  async (input) => {
    try {
      const appointment = await bookAppointment(input);
      recordAssistantAction({ action: "book", outcome: "succeeded", appointmentId: appointment._id.toString() });
      return JSON.stringify({
        message: "Appointment booked successfully",
        appointmentId: appointment._id.toString(),
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        status: appointment.status,
      });
    } catch (error) {
      recordAssistantAction({ action: "book", outcome: "failed", error });
      throw error;
    }
  },
  {
    name: "book_appointment",
    description: "Create a new appointment only after the patient has explicitly confirmed the exact details.",
    schema: z.object({
      patientName: z.string().min(2),
      phoneNumber: z.string().min(7),
      appointmentDate: z.string().transform((value) => normalizeAppointmentDate(value) ?? value).refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Please provide a valid appointment date, for example 15 September or tomorrow"),
      appointmentTime: z.string().min(1),
      email: z.string().email().optional(),
      address: z.string().optional(),
      medicalHistory: z.string().optional(),
    }),
  }
);

export const rescheduleAppointmentTool = tool(
  async (input) => {
    try {
      const appointment = await rescheduleAppointment(input);
      recordAssistantAction({ action: "reschedule", outcome: "succeeded", appointmentId: appointment._id.toString() });
    return JSON.stringify({
      message: "Appointment rescheduled successfully",
      appointmentId: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      status: appointment.status,
    });
    } catch (error) {
      recordAssistantAction({ action: "reschedule", outcome: "failed", error });
      throw error;
    }
  },
  {
    name: "reschedule_appointment",
    description: "Reschedule an appointment only after the patient has explicitly confirmed the exact new date and time.",
    schema: z.object({
      appointmentId: z.string().min(1),
      patientName: z.string().min(2),
      phoneNumber: z.string().min(7),
      appointmentDate: z.string().transform((value) => normalizeAppointmentDate(value) ?? value).refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Please provide a valid appointment date, for example 15 September or tomorrow"),
      appointmentTime: z.string().min(1),
    }),
  }
);

export const cancelAppointmentTool = tool(
  async (input) => {
    try {
      const appointment = await cancelAppointment(input);
      recordAssistantAction({ action: "cancel", outcome: "succeeded", appointmentId: appointment._id.toString() });
    return JSON.stringify({
      message: "Appointment cancelled successfully",
      appointmentId: appointment._id.toString(),
      status: appointment.status,
    });
    } catch (error) {
      recordAssistantAction({ action: "cancel", outcome: "failed", error });
      throw error;
    }
  },
  {
    name: "cancel_appointment",
    description: "Cancel an appointment only after the patient has explicitly confirmed the cancellation.",
    schema: z.object({
      appointmentId: z.string().min(1),
      patientName: z.string().min(2),
      phoneNumber: z.string().min(7),
    }),
  }
);

export const mutationToolNames = new Set([
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
]);

export const doctorAssistantTools = [
  getDoctorClinicDetailsTool,
  searchDoctorKnowledgeTool,
  getAvailableSlotsTool,
  bookAppointmentTool,
  rescheduleAppointmentTool,
  cancelAppointmentTool,
];
