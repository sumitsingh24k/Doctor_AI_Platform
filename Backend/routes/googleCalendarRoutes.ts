import { Router, type Request, type Response } from "express";
import {
  createDoctorGoogleAuthUrl,
  findConnectedDoctor,
  listDoctorCalendarEvents,
  storeDoctorGoogleRefreshToken,
} from "../lib/google.js";
import { Doctor } from "../modal/doctordetails.js";
import { createAgentToken, verifyAgentToken } from "../lib/tenantContext.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const googleCalendarRoutes = Router();

googleCalendarRoutes.get("/doctors/:doctorId/connect", requireAuth, requireRole("doctor", "admin"), async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    if (req.user?.role === "doctor" && req.user.doctorId !== doctor._id.toString()) {
      return res.status(403).json({ message: "You can only connect your own clinic calendar" });
    }
    const state = createAgentToken({
      doctorId: doctor._id.toString(),
      threadId: "google-oauth",
      expiresInSeconds: 600,
    });
    const authUrl = createDoctorGoogleAuthUrl(state);
    return res.status(200).json({ url: authUrl });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Unable to start Google Calendar connection",
    });
  }
});

googleCalendarRoutes.get("/doctors/:doctorId/events", requireAuth, requireRole("doctor", "admin"), async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    if (req.user?.role === "doctor" && req.user.doctorId !== doctor._id.toString()) {
      return res.status(403).json({ message: "You can only view your own clinic calendar" });
    }

    const start = typeof req.query.start === "string" ? new Date(req.query.start) : null;
    const end = typeof req.query.end === "string" ? new Date(req.query.end) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ message: "A valid calendar start and end date are required" });
    }
    if (end.getTime() - start.getTime() > 35 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Calendar date range cannot exceed 35 days" });
    }

    const connectedDoctor = await findConnectedDoctor(doctor._id.toString());
    const events = await listDoctorCalendarEvents({ doctor: connectedDoctor, start, end });
    return res.status(200).json({ events });
  } catch (error) {
    console.error("Unable to load Google Calendar events:", error);
    return res.status(502).json({ message: "Unable to load events from Google Calendar" });
  }
});

const googleOAuthCallback = async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const redirectToFrontend = (status: "connected" | "error" | "cancelled") => {
    const target = new URL("/", frontendUrl);
    target.searchParams.set("calendar", status);
    return res.redirect(target.toString());
  };

  if (typeof req.query.error === "string") {
    return redirectToFrontend("cancelled");
  }

  try {
    const code = req.query.code;
    const state = req.query.state;

    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).json({
        message: "Missing Google OAuth code or doctor id",
      });
    }

    const context = verifyAgentToken(state);
    await storeDoctorGoogleRefreshToken(context.doctorId, code);
    return redirectToFrontend("connected");
  } catch (error) {
    console.error("Unable to complete Google Calendar connection:", error);
    return redirectToFrontend("error");
  }
};

googleCalendarRoutes.get("/oauth2callback", googleOAuthCallback);
googleCalendarRoutes.get("/callback", googleOAuthCallback);

export default googleCalendarRoutes;
