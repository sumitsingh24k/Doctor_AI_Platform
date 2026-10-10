import { Router } from "express";
import { answerTwilioCall, createTwilioCall, replyToTwilioSpeech } from "../controller/twilioVoiceController.js";
import { Doctor } from "../modal/doctordetails.js";
import TwilioIntegration from "../modal/twiliointegrationschema.js";

const twilioVoiceRoutes = Router();

// Twilio sends application/x-www-form-urlencoded webhook bodies.
twilioVoiceRoutes.post("/voice", answerTwilioCall);
twilioVoiceRoutes.post("/voice/reply", replyToTwilioSpeech);
twilioVoiceRoutes.post("/call", createTwilioCall);
twilioVoiceRoutes.post("/integration", async (req, res) => {
	if (req.get("authorization") !== `Bearer ${process.env.TWILIO_CALL_API_KEY?.trim()}`) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const doctorId = typeof req.body.doctorId === "string" ? req.body.doctorId.trim() : "";
	const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
	if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber) || !doctorId) {
		return res.status(400).json({ message: "doctorId and a valid E.164 phoneNumber are required" });
	}

	try {
		const doctor = await Doctor.findById(doctorId);
		if (!doctor) return res.status(404).json({ message: "Doctor not found" });
		const integration = await TwilioIntegration.findOneAndUpdate(
			{ phoneNumber },
			{ $set: { doctorId: doctor._id, status: "connected" } },
			{ new: true, upsert: true, setDefaultsOnInsert: true }
		);
		return res.status(201).json({ integration });
	} catch (error) {
		console.error("Unable to connect Twilio number:", error);
		return res.status(500).json({ message: "Unable to connect Twilio number" });
	}
});

export default twilioVoiceRoutes;
