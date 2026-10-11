import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import {
  ingestDoctorKnowledge,
  searchDoctorKnowledge,
} from "../controller/knowledgecontroller.js";
import {
  doctorDetails,
  getDoctorProfile,
} from "../controller/usercontroller.js";
import { Doctor } from "../modal/doctordetails.js";
import { createAgentToken } from "../lib/tenantContext.js";
import { getAgentContext } from "../lib/requestContext.js";
import { optionalAgentContext, requireDoctorTenant } from "../middleware/agentContext.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const doctorRoutes = Router();
doctorRoutes.use(optionalAgentContext);

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype === "application/pdf");
  },
});

doctorRoutes.post("/profile", requireAuth, requireRole("doctor"), doctorDetails);
doctorRoutes.get("/profile", requireAuth, requireRole("doctor"), requireDoctorTenant, getDoctorProfile);
doctorRoutes.patch("/assistant", requireAuth, requireRole("doctor"), requireDoctorTenant, async (req, res) => {
  const doctorId = getAgentContext()?.doctorId;
  const { assistantName, assistantWelcome, assistantInstructions, assistantLanguages, assistantNodeNotes } = req.body ?? {};
  if (!doctorId) return res.status(403).json({ message: "A doctor profile is required to configure the assistant" });
  if (typeof assistantName !== "string" || !assistantName.trim() || assistantName.length > 60 ||
      typeof assistantWelcome !== "string" || !assistantWelcome.trim() || assistantWelcome.length > 240 ||
      typeof assistantInstructions !== "string" || assistantInstructions.length > 1200 ||
      !Array.isArray(assistantLanguages) || assistantLanguages.length < 1 || assistantLanguages.length > 6 ||
      assistantLanguages.some((language: unknown) => !["en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN"].includes(String(language))) ||
      (assistantNodeNotes !== undefined && (typeof assistantNodeNotes !== "object" || assistantNodeNotes === null || Array.isArray(assistantNodeNotes) || Object.entries(assistantNodeNotes).some(([key, value]) => !["patient-message", "intent-detection", "clinic-knowledge", "appointment-tools", "voice-response"].includes(key) || typeof value !== "string" || value.length > 500)))) {
    return res.status(400).json({ message: "Check the assistant name, welcome, instructions, and selected languages" });
  }
  try {
    const doctor = await Doctor.findByIdAndUpdate(doctorId, { $set: {
      assistantName: assistantName.trim(), assistantWelcome: assistantWelcome.trim(),
      assistantInstructions: assistantInstructions.trim(), assistantLanguages,
      ...(assistantNodeNotes ? { assistantNodeNotes } : {}),
    } }, { new: true, runValidators: true }).select("assistantName assistantWelcome assistantInstructions assistantLanguages assistantNodeNotes");
    if (!doctor) return res.status(404).json({ message: "Doctor profile not found" });
    return res.status(200).json({ assistant: doctor });
  } catch (error) {
    console.error("Unable to save assistant configuration:", error);
    return res.status(500).json({ message: "Unable to save assistant configuration" });
  }
});
doctorRoutes.post("/setup/complete", requireAuth, requireRole("doctor"), requireDoctorTenant, async (_req, res) => {
  try {
    const doctorId = getAgentContext()?.doctorId;
    if (!doctorId) return res.status(403).json({ message: "A doctor profile is required to finish setup" });
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor profile not found" });
    if (!doctor.googleRefreshToken) return res.status(409).json({ message: "Connect Google Calendar before finishing clinic setup" });
    doctor.setupComplete = true;
    await doctor.save();
    return res.status(200).json({ setupComplete: true });
  } catch (error) {
    console.error("Unable to complete doctor setup:", error);
    return res.status(500).json({ message: "Unable to finish clinic setup" });
  }
});
doctorRoutes.get("/directory", async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    const hasLocation =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;
    // Keep the refresh token available while computing connection status, then
    // remove it from each public response below. Excluding it in this query
    // made every directory entry appear disconnected.
    const doctors = await Doctor.find({ setupComplete: true, googleRefreshToken: { $type: "string", $ne: "" } })
      .select("-__v");
    const withDistance = doctors.map((doctor) => {
      const hasClinicCoordinates =
        Number.isFinite(doctor.clinicLatitude) &&
        Number.isFinite(doctor.clinicLongitude);
      let distanceKm: number | null = null;
      if (hasLocation && hasClinicCoordinates) {
        const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
        const latitudeDelta = toRadians(doctor.clinicLatitude! - latitude);
        const longitudeDelta = toRadians(doctor.clinicLongitude! - longitude);
        const haversine =
          Math.sin(latitudeDelta / 2) ** 2 +
          Math.cos(toRadians(latitude)) *
            Math.cos(toRadians(doctor.clinicLatitude!)) *
            Math.sin(longitudeDelta / 2) ** 2;
        distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
      }
      const clinic = doctor.toObject();
      const calendarConnected = Boolean(clinic.googleRefreshToken?.trim());
      delete clinic.googleRefreshToken;
      delete clinic.assistantName;
      delete clinic.assistantWelcome;
      delete clinic.assistantInstructions;
      delete clinic.assistantLanguages;
      delete clinic.assistantNodeNotes;
      return { ...clinic, calendarConnected, distanceKm };
    });
    withDistance.sort((first, second) => {
      if (first.distanceKm === null) return second.distanceKm === null ? 0 : 1;
      if (second.distanceKm === null) return -1;
      return first.distanceKm - second.distanceKm;
    });
    const specialty = typeof req.query.specialty === "string" ? req.query.specialty.trim().toLowerCase() : "";
    const search = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const matches = withDistance.filter((doctor) => {
      const searchable = [doctor.name, doctor.specialization, doctor.clinicName, doctor.clinicAddress]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
      return (!specialty || doctor.specialization?.toLowerCase().includes(specialty)) &&
        (!search || searchable.includes(search));
    });
    return res.status(200).json({ doctors: matches });
  } catch (error) {
    console.error("Unable to load doctor directory:", error);
    return res.status(500).json({ message: "Unable to load doctors" });
  }
});
doctorRoutes.post("/agent/:doctorId/token", async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ _id: req.params.doctorId, setupComplete: true, googleRefreshToken: { $type: "string", $ne: "" } });
    if (!doctor) return res.status(404).json({ message: "Clinic assistant is not available yet" });

    const threadId = typeof req.body?.threadId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(req.body.threadId)
      ? req.body.threadId
      : randomUUID();

    return res.status(201).json({
      token: createAgentToken({
        doctorId: doctor._id.toString(),
        threadId,
      }),
      doctorId: doctor._id,
      threadId,
    });
  } catch (error) {
    console.error("Unable to create doctor agent token:", error);
    return res.status(500).json({ message: "Unable to create doctor agent token" });
  }
});
doctorRoutes.post("/knowledge", requireAuth, requireRole("doctor"), requireDoctorTenant, pdfUpload.single("file"), ingestDoctorKnowledge);
doctorRoutes.post("/knowledge/search", requireAuth, requireRole("doctor"), requireDoctorTenant, searchDoctorKnowledge);

export default doctorRoutes;
