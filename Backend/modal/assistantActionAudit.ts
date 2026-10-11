import mongoose from "mongoose";

const assistantActionAuditSchema = new mongoose.Schema({
  threadId: { type: String, required: true, index: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null, index: true },
  action: { type: String, enum: ["book", "reschedule", "cancel"], required: true },
  outcome: { type: String, enum: ["succeeded", "failed"], required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
  errorCode: { type: Number, default: null },
  errorMessage: { type: String, maxlength: 500, default: "" },
}, { timestamps: true });

export const AssistantActionAudit = mongoose.model("AssistantActionAudit", assistantActionAuditSchema);
