import mongoose from "mongoose";

const assistantAuditLogSchema = new mongoose.Schema({
  threadId: { type: String, required: true, index: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null, index: true },
  channel: { type: String, enum: ["text", "voice"], required: true },
  userMessage: { type: String, required: true, maxlength: 5000 },
  assistantReply: { type: String, required: true, maxlength: 10000 },
  latencyMs: { type: Number, min: 0 },
}, { timestamps: true });

export const AssistantAuditLog = mongoose.model("AssistantAuditLog", assistantAuditLogSchema);
