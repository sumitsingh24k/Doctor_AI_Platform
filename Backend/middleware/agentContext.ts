import { NextFunction, Request, Response } from "express";
import { runWithAgentContext } from "../lib/requestContext.js";
import { getBearerToken, verifyAgentToken } from "../lib/tenantContext.js";
import { verifyAccessToken } from "../lib/auth.js";

export const optionalAgentContext = (req: Request, res: Response, next: NextFunction) => {
  const token = getBearerToken(req.get("authorization"));
  if (!token) return next();

  try {
    const context = verifyAgentToken(token);
    return runWithAgentContext(context, async () => next());
  } catch {
    try {
      verifyAccessToken(token);
      return next();
    } catch {
      return res.status(401).json({ message: "Invalid or expired authentication token" });
    }
  }
};
