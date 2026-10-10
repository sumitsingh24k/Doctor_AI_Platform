import type { AuthRole } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: AuthRole;
        doctorId?: string;
      };
    }
  }
}

export {};
