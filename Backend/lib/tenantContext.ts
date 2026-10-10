import jwt, { type JwtPayload } from "jsonwebtoken";

export type AgentContext = {
  doctorId: string;
  threadId: string;
  expiresAt: number;
};

const getSecret = () => {
  const secret = process.env.AGENT_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("AGENT_TOKEN_SECRET must be configured with at least 32 characters");
  }
  return secret;
};

const JWT_ISSUER = "doctor-platform";
const JWT_AUDIENCE = "doctor-agent";

export const createAgentToken = (input: Omit<AgentContext, "expiresAt"> & { expiresInSeconds?: number }) => {
  return jwt.sign(
    { doctorId: input.doctorId, threadId: input.threadId, type: "agent" },
    getSecret(),
    { expiresIn: input.expiresInSeconds ?? 3600, issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
};

export const verifyAgentToken = (token: string): AgentContext => {
  const payload = jwt.verify(token, getSecret(), { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  if (typeof payload === "string") throw new Error("Invalid agent token payload");
  const value = payload as JwtPayload & { doctorId?: unknown; threadId?: unknown; type?: unknown };
  if (
    value.type !== "agent" ||
    typeof value.doctorId !== "string" ||
    typeof value.threadId !== "string" ||
    typeof value.exp !== "number"
  ) {
    throw new Error("Expired or invalid agent token");
  }

  return { doctorId: value.doctorId, threadId: value.threadId, expiresAt: value.exp };
};

export const getBearerToken = (authorization: string | undefined) => {
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
};
