import mongoose from "mongoose";

const twilioIntegrationSchema = new mongoose.Schema(
  {
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    phoneNumber: { type: String, required: true, trim: true },
    status: { type: String, enum: ["connected", "disconnected"], default: "connected", index: true },
  },
  { timestamps: true }
);

twilioIntegrationSchema.index({ phoneNumber: 1 }, { unique: true });

const TwilioIntegration = mongoose.model("TwilioIntegration", twilioIntegrationSchema);
export default TwilioIntegration;
