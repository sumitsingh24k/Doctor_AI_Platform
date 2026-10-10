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
import { optionalAgentContext } from "../middleware/agentContext.js";
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

doctorRoutes.post("/profile", requireAuth, requireRole("doctor", "admin"), doctorDetails);
doctorRoutes.get("/profile", requireAuth, requireRole("doctor", "admin"), getDoctorProfile);
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
    const doctors = await Doctor.find({}).select("-googleRefreshToken -__v");
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
      return {
        ...doctor.toObject(),
        calendarConnected: Boolean(doctor.googleRefreshToken),
        distanceKm,
      };
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
    return res.status(200).json({ doctors: matches.slice(0, 10) });
  } catch (error) {
    console.error("Unable to load doctor directory:", error);
    return res.status(500).json({ message: "Unable to load doctors" });
  }
});
doctorRoutes.post("/agent/:doctorId/token", async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

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
doctorRoutes.post("/knowledge", requireAuth, requireRole("doctor", "admin"), pdfUpload.single("file"), ingestDoctorKnowledge);
doctorRoutes.post("/knowledge/search", requireAuth, requireRole("doctor", "admin"), searchDoctorKnowledge);

export default doctorRoutes;
