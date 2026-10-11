import { SarvamAI, SarvamAIClient } from "sarvamai";

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

type TranscriptionOptions = {
  languageCode?: SarvamAI.SpeechToTextLanguage;
  mode?: SarvamAI.Mode;
  signal?: AbortSignal;
};

export type SpeechToTextLanguage = SarvamAI.SpeechToTextLanguage;
export type TextToSpeechLanguage = SarvamAI.TextToSpeechLanguage;

// `unknown` asks Sarvam to detect the spoken language. It is the default so a
// client never has to guess the user's language before uploading audio.
export const STT_LANGUAGE_CODES = new Set<SpeechToTextLanguage>([
  "unknown", "hi-IN", "bn-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN",
  "pa-IN", "ta-IN", "te-IN", "en-IN", "gu-IN", "as-IN", "ur-IN",
  "ne-IN", "kok-IN", "ks-IN", "sd-IN", "sa-IN", "sat-IN", "mni-IN",
  "brx-IN", "mai-IN", "doi-IN",
]);

export const isSpeechToTextLanguage = (value: unknown): value is SpeechToTextLanguage =>
  typeof value === "string" && STT_LANGUAGE_CODES.has(value.trim() as SpeechToTextLanguage);

export class VoiceTranscriptionError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}

export class VoiceSynthesisError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}

const getSarvamClient = () => {
  const apiSubscriptionKey = process.env.SARVAM_API_KEY;
  if (!apiSubscriptionKey) {
    throw new VoiceTranscriptionError("Speech-to-text is not configured", 503);
  }
  return new SarvamAIClient({ apiSubscriptionKey });
};

const getProviderStatusCode = (error: unknown) => {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { statusCode?: unknown; status?: unknown; rawResponse?: { status?: unknown } };
  return typeof value.statusCode === "number"
    ? value.statusCode
    : typeof value.status === "number"
      ? value.status
      : typeof value.rawResponse?.status === "number"
        ? value.rawResponse.status
        : undefined;
};

const isAbortError = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || error.name === "CanceledError");

// Sarvam's SDK turns an aborted fetch into SarvamAIError (HTTP 499), rather
// than preserving the native AbortError. Treat that response as cancellation
// so a user speaking over a reply (barge-in) is not logged as a TTS failure.
const isSarvamCancellation = (error: unknown) =>
  getProviderStatusCode(error) === 499 &&
  error instanceof Error &&
  /aborted|cancelled|canceled|client closed request/i.test(error.message);

// The uploaded buffer is passed straight to Sarvam. Nothing is persisted on disk.
export const transcribeAudio = async (
  file: Express.Multer.File,
  options: TranscriptionOptions = {}
) => {
  if (!file.buffer.length) {
    throw new VoiceTranscriptionError("The audio file is empty", 400);
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new VoiceTranscriptionError("Audio files must be 15 MB or smaller", 413);
  }

  // MediaRecorder includes codec parameters (for example,
  // "audio/webm;codecs=opus"). Sarvam validates the media type without those
  // parameters, so send only the normalized type in the upload metadata.
  const suppliedContentType = (file.mimetype || "application/octet-stream")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase() || "application/octet-stream";
  const contentType = suppliedContentType === "audio/x-wav" ? "audio/wav" : suppliedContentType;

  try {
    const response = await getSarvamClient().speechToText.transcribe({
      file: {
        data: file.buffer,
        filename: file.originalname || `voice-message.${contentType === "audio/mp4" ? "mp4" : contentType === "audio/ogg" ? "ogg" : "webm"}`,
        contentType,
        contentLength: file.size,
      },
      model: "saaras:v4",
      mode: options.mode ?? "transcribe",
      ...(options.languageCode ? { language_code: options.languageCode } : {}),
    }, options.signal ? { abortSignal: options.signal } : undefined);
    const transcript = response.transcript.trim();
    if (!transcript) {
      throw new VoiceTranscriptionError("No speech was detected in this audio", 422);
    }
    return {
      transcript,
      languageCode: response.language_code,
      requestId: response.request_id,
    };
  } catch (error) {
    if (error instanceof VoiceTranscriptionError) throw error;
    const providerStatus = getProviderStatusCode(error);
    if (options.signal?.aborted || isAbortError(error)) {
      throw new DOMException("Speech transcription was cancelled", "AbortError");
    }
    console.warn("voice.stt.failed", {
      provider: "sarvam",
      status: providerStatus,
      requestId: typeof error === "object" && error !== null && "requestId" in error ? String((error as { requestId: unknown }).requestId) : undefined,
      contentType,
      bytes: file.size,
    });
    if (providerStatus === 403) {
      throw new VoiceTranscriptionError("Speech-to-text authentication failed", 503);
    }
    if (providerStatus === 429) {
      throw new VoiceTranscriptionError("Speech-to-text is temporarily busy. Please try again.", 429);
    }
    if (providerStatus === 400) {
      throw new VoiceTranscriptionError("The speech service rejected this audio format. Please try recording again.", 415);
    }
    if (providerStatus === 499) {
      throw new VoiceTranscriptionError("The speech service ended the transcription request. Please try again.", 502);
    }
    if (providerStatus === 0 || error instanceof Error && /fetch failed/i.test(error.message)) {
      throw new VoiceTranscriptionError("The speech service could not be reached. Check this server's internet or firewall connection to api.sarvam.ai.", 503);
    }
    throw new VoiceTranscriptionError("Unable to transcribe the audio", 502);
  }
};

export const synthesizeSpeech = async (
  text: string,
  languageCode: TextToSpeechLanguage,
  signal?: AbortSignal,
) => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    throw new VoiceSynthesisError("Text is required to create speech", 400);
  }
  if (normalizedText.length > 2500) {
    throw new VoiceSynthesisError("Text must be 2,500 characters or shorter", 400);
  }

  try {
    const response = await getSarvamClient().textToSpeech.convert({
      text: normalizedText,
      language_code: languageCode,
      model: "bulbul:v3",
      speaker: "shubh",
      output_audio_codec: "wav",
      speech_sample_rate: 24000,
      pace: 1,
    }, signal ? { abortSignal: signal } : undefined);
    const audioBase64 = response.audios.join("");
    if (!audioBase64) {
      throw new VoiceSynthesisError("Speech service returned no audio", 502);
    }
    return {
      audio: Buffer.from(audioBase64, "base64"),
      audioBase64,
      requestId: response.request_id,
      contentType: "audio/wav",
    };
  } catch (error) {
    if (error instanceof VoiceSynthesisError) throw error;
    const providerStatus = getProviderStatusCode(error);
    if (signal?.aborted || isAbortError(error) || isSarvamCancellation(error)) {
      throw new DOMException("Speech synthesis was cancelled", "AbortError");
    }
    console.error("Sarvam speech synthesis failed:", error);
    if (providerStatus === 403) {
      throw new VoiceSynthesisError("Text-to-speech authentication failed", 503);
    }
    if (providerStatus === 429) {
      throw new VoiceSynthesisError("Text-to-speech is temporarily busy. Please try again.", 429);
    }
    if (providerStatus === 0 || error instanceof Error && /fetch failed/i.test(error.message)) {
      throw new VoiceSynthesisError("The speech service could not be reached. Check this server's internet or firewall connection to api.sarvam.ai.", 503);
    }
    throw new VoiceSynthesisError("Unable to create speech audio", 502);
  }
};
