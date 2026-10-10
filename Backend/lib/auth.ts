import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthRole = "admin" | "doctor" | "patient";
export type AccessTokenPayload = {
  userId: string;
  role: AuthRole;
  doctorId?: string;
  expiresAt: number;
};

const getSecret = () => {
  const secret = process.env.AUTH_TOKEN_SECRET?.trim() || process.env.AGENT_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_TOKEN_SECRET must be configured with at least 32 characters");
  return secret;
};

const JWT_ISSUER = "doctor-platform";
const JWT_AUDIENCE = "doctor-platform-api";

const derivePasswordKey = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key as Buffer));
});

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = await derivePasswordKey(password, salt);
  return `scrypt:${salt}:${derived.toString("hex")}`;
};

export const verifyPassword = async (password: string, stored: string) => {
  const [, salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = await derivePasswordKey(password, salt);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const createAccessToken = (input: Omit<AccessTokenPayload, "expiresAt">) => {
  return jwt.sign(
    {
      sub: input.userId,
      role: input.role,
      ...(input.doctorId ? { doctorId: input.doctorId } : {}),
      type: "access",
    },
    getSecret(),
    { expiresIn: "15m", issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const payload = jwt.verify(token, getSecret(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (typeof payload === "string") throw new Error("Invalid access token payload");
  const claims = payload as JwtPayload & { role?: unknown; doctorId?: unknown; type?: unknown };
  if (
    claims.type !== "access" ||
    typeof claims.sub !== "string" ||
    (claims.role !== "admin" && claims.role !== "doctor" && claims.role !== "patient") ||
    typeof claims.exp !== "number"
  ) {
    throw new Error("Invalid access token claims");
  }
  return {
    userId: claims.sub,
    role: claims.role,
    ...(typeof claims.doctorId === "string" ? { doctorId: claims.doctorId } : {}),
    expiresAt: claims.exp,
  };
};

export const createRefreshToken = () => randomBytes(48).toString("base64url");
export const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const getRefreshTokenCookie = (cookieHeader: string | undefined) => cookieHeader?.split(";").map((value) => value.trim()).find((value) => value.startsWith("refreshToken="))?.slice("refreshToken=".length);
export const setRefreshTokenCookie = (value: string, maxAge: number) => `refreshToken=${encodeURIComponent(value)}; Path=/api/auth; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;