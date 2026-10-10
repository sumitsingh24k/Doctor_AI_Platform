import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import connectDB from "./lib/db_connect.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import googleCalendarRoutes from "./routes/googleCalendarRoutes.js";
import twilioVoiceRoutes from "./routes/twilioVoiceRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { installVoiceWebSocketServer } from "./lib/socket.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
if (!process.env.GEMINI_API_KEY?.trim()) {
  console.warn(
    "GEMINI_API_KEY is not configured. The server can start, but clinic knowledge-base features require this key."
  );
}
if (!process.env.SARVAM_API_KEY?.trim()) {
  console.warn(
    "SARVAM_API_KEY is not configured. Voice transcription and spoken replies require this key."
  );
}
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/api/auth", authRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/assistant/twilio", twilioVoiceRoutes);
app.use("/api/google-calendar", googleCalendarRoutes);
app.use("/api/calendar", googleCalendarRoutes);
app.use(appointmentRoutes);

await connectDB();

const server = createServer(app);
installVoiceWebSocketServer(server);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
