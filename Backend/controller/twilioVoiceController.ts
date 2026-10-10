import { createHmac, timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { invokeAssistant } from "./assistantcontroller.js";
import TwilioIntegration from "../modal/twiliointegrationschema.js";
import { Doctor } from "../modal/doctordetails.js";
import type { AgentContext } from "../lib/tenantContext.js";

const MAX_SPOKEN_REPLY_LENGTH = 1_200;
// Trial Voice webhooks have a 5-second TwiML fetch limit. Leave a small buffer
// for ngrok and network latency so Twilio always receives a valid response.
const VOICE_ASSISTANT_TIMEOUT_MS = 4_000;
const CALL_API_KEY_HEADER = "authorization";
const E164_PHONE_NUMBER = /^\+[1-9]\d{7,14}$/;
const INDIAN_VOICE = "Polly.Aditi";
const ENGLISH_LANGUAGE = "en-IN";
const HINDI_LANGUAGE = "hi-IN";
const SLOW_SPEECH_RATE = "85%";
type VoiceLanguage = typeof ENGLISH_LANGUAGE | typeof HINDI_LANGUAGE;

const xmlEscape = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&apos;");

const twiml = (body: string) => {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
};

const sendTwiml = (res: Response, body: string) => {
  res.type("text/xml").send(twiml(body));
};

const saySlow = (text: string, language: VoiceLanguage) => {
  return `<Say voice="${INDIAN_VOICE}" language="${language}"><prosody rate="${SLOW_SPEECH_RATE}">${xmlEscape(text)}</prosody></Say>`;
};

const isVoiceLanguage = (value: unknown): value is VoiceLanguage =>
  value === ENGLISH_LANGUAGE || value === HINDI_LANGUAGE;

const detectSpeechLanguage = (speech: string, fallback: VoiceLanguage): VoiceLanguage =>
  /[\u0900-\u097F]/u.test(speech) ? HINDI_LANGUAGE : fallback;

const requiredSetting = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const withVoiceDeadline = <T>(work: Promise<T>) => Promise.race<T>([
  work,
  new Promise<T>((_resolve, reject) => {
    setTimeout(() => reject(new Error("Voice assistant response exceeded the Twilio webhook deadline")), VOICE_ASSISTANT_TIMEOUT_MS);
  }),
]);

const publicWebhookUrl = (req: Request) => {
  const baseUrl = requiredSetting("TWILIO_WEBHOOK_BASE_URL").replace(/\/$/, "");
  return `${baseUrl}${req.originalUrl}`;
};

const getTwilioAgentContext = async (req: Request, callSid: string): Promise<AgentContext> => {
  const phoneNumber = typeof req.body.To === "string" ? req.body.To.trim() : "";
  const integration = await TwilioIntegration.findOne({ phoneNumber, status: "connected" });
  if (integration) {
    return {
      doctorId: integration.doctorId.toString(),
      threadId: `twilio-${integration.doctorId.toString()}-${callSid}`,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  const legacyDoctorId = process.env.TWILIO_DEFAULT_DOCTOR_ID?.trim();
  if (legacyDoctorId && phoneNumber === process.env.TWILIO_PHONE_NUMBER?.trim()) {
    const doctor = await Doctor.findById(legacyDoctorId);
    if (doctor) {
      return {
        doctorId: doctor._id.toString(),
        threadId: `twilio-${doctor._id.toString()}-${callSid}`,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    }
  }

  throw new Error("This Twilio number is not connected to a doctor");
};

// Twilio signs every webhook. Verifying it prevents a third party from using
// this endpoint to talk to the medical assistant or initiate call behaviour.
const isValidTwilioRequest = (req: Request) => {
  const signature = req.get("x-twilio-signature");
  if (!signature) return false;

  const authToken = requiredSetting("TWILIO_AUTH_TOKEN");
  const params = Object.entries(req.body as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${String(value)}`)
    .join("");
  const expected = createHmac("sha1", authToken).update(`${publicWebhookUrl(req)}${params}`).digest("base64");
  const received = Buffer.from(signature);
  const computed = Buffer.from(expected);
  return received.length === computed.length && timingSafeEqual(received, computed);
};

const verifyTwilioWebhook = (req: Request, res: Response) => {
  try {
    if (isValidTwilioRequest(req)) return true;
    // The Console's trial-call tester can omit this header. Allow that one
    // development scenario only when it has been deliberately enabled.
    const canAcceptUnsignedTrialWebhook =
      process.env.NODE_ENV !== "production" &&
      process.env.TWILIO_ALLOW_UNSIGNED_WEBHOOKS === "true" &&
      !req.get("x-twilio-signature");
    if (canAcceptUnsignedTrialWebhook) {
      console.warn("Accepting unsigned Twilio webhook because TWILIO_ALLOW_UNSIGNED_WEBHOOKS=true.");
      return true;
    }
  } catch (error) {
    console.error("Twilio webhook configuration error:", error);
  }
  res.status(403).type("text/plain").send("Invalid Twilio request");
  return false;
};

const gatherSpeech = (prompt: string, language: VoiceLanguage) => {
  // Absolute URLs are important for the Console trial proxy. A relative action
  // can otherwise be resolved against Twilio's proxy instead of this backend.
  const baseUrl = requiredSetting("TWILIO_WEBHOOK_BASE_URL").replace(/\/$/, "");
  const replyUrl = `${baseUrl}/api/assistant/twilio/voice/reply`;
  const voiceUrl = `${baseUrl}/api/assistant/twilio/voice`;
  const action = `${replyUrl}?language=${encodeURIComponent(language)}`;
  return `<Gather input="speech" action="${xmlEscape(action)}" actionOnEmptyResult="true" method="POST" language="${language}" speechTimeout="auto" timeout="5">${saySlow(prompt, language)}</Gather><Redirect method="POST">${xmlEscape(voiceUrl)}</Redirect>`;
};

const languageChoice = () => {
  const baseUrl = requiredSetting("TWILIO_WEBHOOK_BASE_URL").replace(/\/$/, "");
  const replyUrl = `${baseUrl}/api/assistant/twilio/voice/reply`;
  return `<Gather input="speech dtmf" action="${xmlEscape(replyUrl)}" actionOnEmptyResult="true" method="POST" language="${ENGLISH_LANGUAGE}" speechTimeout="auto" timeout="5"><Say voice="${INDIAN_VOICE}" language="${ENGLISH_LANGUAGE}"><prosody rate="${SLOW_SPEECH_RATE}">For English, press 1 or say English. Hindi के लिए 2 दबाएं या Hindi बोलें.</prosody></Say></Gather><Redirect method="POST">${xmlEscape(replyUrl)}</Redirect>`;
};

export const answerTwilioCall = async (req: Request, res: Response) => {
  if (!verifyTwilioWebhook(req, res)) return;
  try {
    await getTwilioAgentContext(req, typeof req.body.CallSid === "string" ? req.body.CallSid : "unknown");
  } catch {
    return res.status(404).type("text/plain").send("This Twilio number is not connected");
  }
  return sendTwiml(res, languageChoice());
};

export const replyToTwilioSpeech = async (req: Request, res: Response) => {
  if (!verifyTwilioWebhook(req, res)) return;

  const speech = typeof req.body.SpeechResult === "string" ? req.body.SpeechResult.trim() : "";
  const digits = typeof req.body.Digits === "string" ? req.body.Digits.trim() : "";
  const callSid = typeof req.body.CallSid === "string" ? req.body.CallSid.trim() : "";
  const requestedLanguage = isVoiceLanguage(req.query.language) ? req.query.language : ENGLISH_LANGUAGE;
  const language = digits === "2"
    ? HINDI_LANGUAGE
    : digits === "1"
      ? ENGLISH_LANGUAGE
      : detectSpeechLanguage(speech, requestedLanguage);
  if (digits === "1" || digits === "2") {
    const prompt = language === HINDI_LANGUAGE
      ? "नमस्ते। मैं डॉक्टर Ravikant ka Ai असिस्टेंट हूँ। आप क्या पूछना चाहते हैं?"
      : "Hello. I am the doctor assistant. How can I help you?";
    return sendTwiml(res, gatherSpeech(prompt, language));
  }
  if (!speech || !callSid) {
    return sendTwiml(res, gatherSpeech(
      language === HINDI_LANGUAGE ? "मुझे आपकी बात सुनाई नहीं दी। कृपया फिर से बोलें।" : "I did not hear that clearly. Please say it again.",
      language,
    ));
  }

  try {
    const agentContext = await getTwilioAgentContext(req, callSid);
    const reply = await withVoiceDeadline(
      invokeAssistant(speech, agentContext.threadId, {
        voiceFastPath: true,
        voiceLanguage: language,
        agentContext,
      }),
    );
    const safeReply = reply.trim().slice(0, MAX_SPOKEN_REPLY_LENGTH) || "I am sorry, I could not prepare a response.";
    return sendTwiml(res, `${saySlow(safeReply, language)}${gatherSpeech(
      language === HINDI_LANGUAGE ? "आप एक और सवाल पूछ सकते हैं।" : "You can ask another question, or simply hang up to end the call.",
      language,
    )}`);
  } catch (error) {
    console.error("Twilio voice assistant failed:", error);
    const isTimeout = error instanceof Error && error.message.includes("webhook deadline");
    const prompt = isTimeout
      ? "I need a little more time to process that. Please ask a short question again."
      : "I am sorry, the assistant is unavailable right now. Please try again shortly.";
    return sendTwiml(res, gatherSpeech(prompt, language));
  }
};

export const createTwilioCall = async (req: Request, res: Response) => {
  const configuredApiKey = process.env.TWILIO_CALL_API_KEY?.trim();
  const authorization = req.get(CALL_API_KEY_HEADER);
  if (!configuredApiKey || authorization !== `Bearer ${configuredApiKey}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const to = typeof req.body.to === "string" ? req.body.to.trim() : "";
  if (!E164_PHONE_NUMBER.test(to)) {
    return res.status(400).json({ message: "'to' must be an E.164 phone number, for example +919876543210." });
  }

  try {
    const accountSid = requiredSetting("TWILIO_ACCOUNT_SID");
    const authToken = requiredSetting("TWILIO_AUTH_TOKEN");
    const from = requiredSetting("TWILIO_PHONE_NUMBER");
    const callUrl = `${requiredSetting("TWILIO_WEBHOOK_BASE_URL").replace(/\/$/, "")}/api/assistant/twilio/voice`;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Url: callUrl }).toString(),
    });
    const data = await response.json() as { sid?: string; message?: string };
    if (!response.ok) {
      console.error("Twilio call creation failed:", data);
      return res.status(502).json({ message: "Twilio could not place the call." });
    }
    return res.status(201).json({ callSid: data.sid, status: "queued" });
  } catch (error) {
    console.error("Twilio call configuration error:", error);
    return res.status(503).json({ message: "Calling is not configured." });
  }
};
