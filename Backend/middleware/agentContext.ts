import { NextFunction, Request, Response } from "express";
import { runWithAgentContext } from "../lib/requestContext.js";
import { getBearerToken, verifyAgentToken } from "../lib/tenantContext.js";
import { verifyAccessToken } from "../lib/auth.js";
import User from "../modal/userschema.js";

export const requireDoctorTenant = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "doctor") return res.status(403).json({ message: "A doctor account is required for this operation" });
  const account = await User.findById(req.user.userId).select("doctorId");
  const doctorId = account?.doctorId?.toString();
  if (!doctorId) return res.status(403).json({ message: "A doctor profile is required for this operation" });
  const userId = req.user.userId;
  const expiresAt = req.user.expiresAt;
  return runWithAgentContext({
    doctorId,
    threadId: `user-${userId}`,
    expiresAt,
  }, async () => next());
};

export const scopeAuthenticatedDoctor = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "doctor") return next();
  return requireDoctorTenant(req, res, next);
};

export const optionalAgentContext = (req: Request, res: Response, next: NextFunction) => {
  const token = getBearerToken(req.get("authorization"));
  if (!token) return next();

  try {
    const context = verifyAgentToken(token);
    return runWithAgentContext(context, async () => next());
  } catch {
    try {
      const user = verifyAccessToken(token);
      if (user.role === "doctor" && user.doctorId) {
        return runWithAgentContext({
          doctorId: user.doctorId,
          threadId: `user-${user.userId}`,
          expiresAt: user.expiresAt,
        }, async () => next());
      }
      return next();
    } catch {
      return res.status(401).json({ message: "Invalid or expired authentication token" });
    }
  }
};
