import mongoose from "mongoose";

const doctorKnowledgeSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    sourceFileName: {
      type: String,
      required: true,
    },
    sourcePublicId: {
      type: String,
      required: true,
    },
    sourceUrl: {
      type: String,
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    documentType: {
      type: String,
      required: true,
      default: "doctor-knowledge",
      index: true,
    },
    category: {
      type: String,
      required: true,
      default: "general",
      index: true,
    },
    language: {
      type: String,
      required: true,
      default: "en",
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);


const DoctorKnowledge = mongoose.model("DoctorKnowledge", doctorKnowledgeSchema);

export default DoctorKnowledge;
