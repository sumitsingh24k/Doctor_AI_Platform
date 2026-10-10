import { Request, Response } from "express";
import {Doctor} from "../modal/doctordetails.js";
import { getAgentContext } from "../lib/requestContext.js";
import User from "../modal/userschema.js";

export const doctorDetails = async (req: Request, res: Response) => {
  try {
    const {
      name,
      specialization,
      qualification,
      clinicAddress,
      clinicName,
      aboutDoctor,
      clinicOpeningTime,
      clinicClosingTime,
      clinicTimeZone,
      appointmentDurationMinutes,
      clinicLatitude,
      clinicLongitude,
    } = req.body;

    const isValidClockTime = (value: unknown) =>
      typeof value === "string" &&
      /^(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:AM|PM))?$/i.test(value.trim());

    if (
      typeof name !== "string" ||
      typeof specialization !== "string" ||
      typeof qualification !== "string" ||
      typeof clinicAddress !== "string" ||
      typeof clinicName !== "string" ||
      typeof aboutDoctor !== "string" ||
      !name.trim() ||
      !specialization.trim() ||
      !qualification.trim() ||
      !clinicAddress.trim() ||
      !clinicName.trim() ||
      !aboutDoctor.trim() ||
      !isValidClockTime(clinicOpeningTime) ||
      !isValidClockTime(clinicClosingTime)
    ) {
      return res.status(400).json({
        message: "Valid doctor details and clinic opening/closing times are required",
      });
    }

    if (
      appointmentDurationMinutes !== undefined &&
      (!Number.isInteger(appointmentDurationMinutes) ||
        appointmentDurationMinutes < 5 ||
        appointmentDurationMinutes > 240)
    ) {
      return res.status(400).json({
        message: "Appointment duration must be between 5 and 240 minutes",
      });
    }

    if (
      (clinicLatitude !== undefined &&
        (typeof clinicLatitude !== "number" || !Number.isFinite(clinicLatitude) || clinicLatitude < -90 || clinicLatitude > 90)) ||
      (clinicLongitude !== undefined &&
        (typeof clinicLongitude !== "number" || !Number.isFinite(clinicLongitude) || clinicLongitude < -180 || clinicLongitude > 180))
    ) {
      return res.status(400).json({ message: "Clinic latitude and longitude must be valid coordinates" });
    }

    if (!req.user) return res.status(401).json({ message: "Authentication required" });
    const context = getAgentContext();
    const doctorId = req.user.doctorId ?? context?.doctorId;
    const profileData = {
      name: name.trim(),
      specialization: specialization.trim(),
      qualification: qualification.trim(),
      clinicAddress: clinicAddress.trim(),
      clinicName: clinicName.trim(),
      aboutDoctor: aboutDoctor.trim(),
      clinicOpeningTime: clinicOpeningTime.trim(),
      clinicClosingTime: clinicClosingTime.trim(),
      ...(typeof clinicTimeZone === "string" && clinicTimeZone.trim()
        ? { clinicTimeZone: clinicTimeZone.trim() }
        : {}),
      ...(appointmentDurationMinutes !== undefined
        ? { appointmentDurationMinutes }
        : {}),
      ...(clinicLatitude !== undefined ? { clinicLatitude } : {}),
      ...(clinicLongitude !== undefined ? { clinicLongitude } : {}),
    };
    const doctorProfile = doctorId
      ? await Doctor.findOneAndUpdate(
        { _id: doctorId },
        { $set: profileData },
        { new: true, runValidators: true }
      ).select("-googleRefreshToken")
      : await Doctor.create(profileData);

    if (!doctorProfile) return res.status(500).json({ message: "Unable to save doctor profile" });
    if (!doctorId) await User.findByIdAndUpdate(req.user.userId, { $set: { doctorId: doctorProfile._id } });

    if (!doctorProfile) {
      return res.status(500).json({ message: "Unable to save doctor profile" });
    }

    return res.status(200).json({
      message: "Doctor profile saved successfully",
      doctor: doctorProfile,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getDoctorProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Authentication required" });
    const context = getAgentContext();
    const doctorId = req.user.doctorId ?? context?.doctorId;
    if (!doctorId) return res.status(404).json({ message: "Doctor profile not found" });
    const doctor = await Doctor.findOne({ _id: doctorId });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor profile not found" });
    }

    const doctorData = doctor.toObject();
    delete doctorData.googleRefreshToken;
    return res.status(200).json({
      doctor: { ...doctorData, calendarConnected: Boolean(doctor.googleRefreshToken) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
