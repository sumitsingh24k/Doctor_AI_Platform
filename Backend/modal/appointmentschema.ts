import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },

    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    patientName: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    appointmentDate: {
      type: Date,
      required: true,
    },

    appointmentTime: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["booked", "completed", "cancelled"],
      default: "booked",
    },

    visitType: {
      type: String,
      enum: ["new", "follow-up"],
      default: "new",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    googleEventId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


const Appointment = mongoose.model(
  "Appointment",
  appointmentSchema
);

export default Appointment;
