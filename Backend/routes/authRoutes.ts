import { Router } from "express";
import { login, logout, me, refresh, register } from "../controller/authcontroller.js";
import { requireAuth } from "../middleware/auth.js";

const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/refresh", refresh);
authRoutes.post("/logout", requireAuth, logout);
authRoutes.get("/me", requireAuth, me);

export default authRoutes;
