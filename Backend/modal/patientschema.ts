import mongoose from "mongoose";

const medicalDocumentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
      default: "application/pdf",
    },
    size: {
      type: Number,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const patientSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      minlength: 7,
      maxlength: 20,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    medicalHistory: {
      type: String,
      trim: true,
      default: "",
    },

    medicalDocuments: {
      type: [medicalDocumentSchema],
      default: [],
    },
  },
  { timestamps: true }
);

patientSchema.index({ doctorId: 1, phoneNumber: 1 }, { unique: true });


const Patient = mongoose.model("Patient", patientSchema);

export default Patient;
