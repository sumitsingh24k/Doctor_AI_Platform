import "dotenv/config";
import mongoose from "mongoose";
import { hashPassword } from "../lib/auth.js";
import User from "../modal/userschema.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 6) {
  throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 6 characters in Backend/.env first.");
}

const mongoUri = process.env.MONGO_URI?.trim();
if (!mongoUri) throw new Error("Set MONGO_URI in Backend/.env first.");
console.log("Connecting to MongoDB to update the admin account…");
await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15_000 });
const passwordHash = await hashPassword(password);
await User.findOneAndUpdate(
  { email },
  { $set: { name: "Platform Admin", email, role: "admin", passwordHash, refreshTokenHash: null, refreshTokenExpiresAt: null } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
console.log(`Admin account is ready for ${email}.`);
await mongoose.disconnect();
