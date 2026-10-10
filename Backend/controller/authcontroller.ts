import { Request, Response } from "express";
import User from "../modal/userschema.js";
import { Doctor } from "../modal/doctordetails.js";
import {
  createAccessToken,
  createRefreshToken,
  getRefreshTokenCookie,
  hashPassword,
  hashRefreshToken,
  setRefreshTokenCookie,
  verifyPassword,
} from "../lib/auth.js";

const REFRESH_TOKEN_DAYS = 30;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (user: InstanceType<typeof User>) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  doctorId: user.doctorId ?? null,
});

const issueTokens = async (user: InstanceType<typeof User>, res: Response) => {
  const refreshToken = createRefreshToken();
  user.refreshTokenHash = hashRefreshToken(refreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await user.save();
  const accessToken = createAccessToken({
    userId: user._id.toString(),
    role: user.role,
    ...(user.doctorId ? { doctorId: user.doctorId.toString() } : {}),
  });
  res.setHeader("Set-Cookie", setRefreshTokenCookie(refreshToken, REFRESH_TOKEN_DAYS * 24 * 60 * 60));
  return accessToken;
};

export const register = async (req: Request, res: Response) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const role = req.body.role === "patient" ? "patient" : "doctor";

  if (name.length < 2 || !emailPattern.test(email) || password.length < 8) {
    return res.status(400).json({ message: "Name, valid email, and password of at least 8 characters are required" });
  }
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "An account with this email already exists" });
    const user = await User.create({ name, email, passwordHash: await hashPassword(password), role });
    const accessToken = await issueTokens(user, res);
    return res.status(201).json({ accessToken, user: publicUser(user) });
  } catch (error) {
    console.error("Registration failed:", error);
    return res.status(500).json({ message: "Unable to create account" });
  }
};

export const login = async (req: Request, res: Response) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!emailPattern.test(email) || !password) return res.status(400).json({ message: "Email and password are required" });
  try {
    const user = await User.findOne({ email }).select("+passwordHash +refreshTokenHash +refreshTokenExpiresAt");
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const accessToken = await issueTokens(user, res);
    return res.status(200).json({ accessToken, user: publicUser(user) });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ message: "Unable to log in" });
  }
};

export const refresh = async (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenCookie(req.get("cookie"));
  if (!refreshToken) return res.status(401).json({ message: "Refresh token is required" });
  try {
    const user = await User.findOne({ refreshTokenHash: hashRefreshToken(refreshToken) }).select("+passwordHash +refreshTokenHash +refreshTokenExpiresAt");
    if (!user || !user.refreshTokenExpiresAt || user.refreshTokenExpiresAt <= new Date()) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }
    const accessToken = await issueTokens(user, res);
    return res.status(200).json({ accessToken, user: publicUser(user) });
  } catch (error) {
    console.error("Token refresh failed:", error);
    return res.status(500).json({ message: "Unable to refresh session" });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    if (req.user?.userId) await User.findByIdAndUpdate(req.user.userId, { $set: { refreshTokenHash: null, refreshTokenExpiresAt: null } });
  } finally {
    res.setHeader("Set-Cookie", setRefreshTokenCookie("", 0));
    return res.status(204).send();
  }
};

export const me = async (req: Request, res: Response) => {
  const user = req.user ? await User.findById(req.user.userId) : null;
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.status(200).json({ user: publicUser(user) });
};

export const createDoctorProfileForUser = async (userId: string, doctorData: Record<string, unknown>) => {
  const doctor = await Doctor.create(doctorData);
  await User.findByIdAndUpdate(userId, { $set: { doctorId: doctor._id } });
  return doctor;
};
