import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchDoctorKnowledgeForAssistant } from "../controller/knowledgecontroller.js";
import { getAvailableAppointmentWeek } from "../services/appointment.service.js";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "../services/appointment-actions.service.js";
import { normalizeAppointmentDate } from "../lib/appointmentDate.js";

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
  async ({ date }) => JSON.stringify(await getAvailableAppointmentWeek(date)),
  {
    name: "get_available_appointment_slots",
    description:
      "Get genuinely available appointment slots for a rolling seven-day window. If the patient gives a date, start from that date; otherwise start from today. Return only slots that are actually open. Never invent slots.",
    schema: z.object({
      date: z.string().optional().transform((value) => value ? normalizeAppointmentDate(value) : undefined).refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Please provide a valid appointment date, for example 15 September or tomorrow"),
    }),
  }
);

export const bookAppointmentTool = tool(
  async (input) => {
    const appointment = await bookAppointment(input);
    return JSON.stringify({
      message: "Appointment booked successfully",
      appointmentId: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      status: appointment.status,
    });
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
    const appointment = await rescheduleAppointment(input);
    return JSON.stringify({
      message: "Appointment rescheduled successfully",
      appointmentId: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      status: appointment.status,
    });
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
    const appointment = await cancelAppointment(input);
    return JSON.stringify({
      message: "Appointment cancelled successfully",
      appointmentId: appointment._id.toString(),
      status: appointment.status,
    });
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
  searchDoctorKnowledgeTool,
  getAvailableSlotsTool,
  bookAppointmentTool,
  rescheduleAppointmentTool,
  cancelAppointmentTool,
];
