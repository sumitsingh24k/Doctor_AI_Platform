import { Router } from "express";
import multer from "multer";
import { chatWithDoctorAssistant, voiceUpload } from "../controller/assistantcontroller.js";
import { MAX_AUDIO_BYTES } from "../voiceservices/sarvamconnect.js";
import { optionalAgentContext } from "../middleware/agentContext.js";

const assistantRoutes = Router();
assistantRoutes.use(optionalAgentContext);
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype.startsWith("audio/")),
});

assistantRoutes.post("/chat", chatWithDoctorAssistant);
assistantRoutes.post("/voice", audioUpload.single("audio"), voiceUpload);

export default assistantRoutes;
