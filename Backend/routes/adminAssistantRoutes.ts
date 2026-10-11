import { Router } from "express";
import { analyseLiveAssistantConversations, getAssistantEvaluation, listAssistantConversations, runAssistantEvaluationNow } from "../controller/adminAssistantController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const adminAssistantRoutes = Router();
adminAssistantRoutes.use(requireAuth, requireRole("admin"));
adminAssistantRoutes.get("/assistant-evaluations", getAssistantEvaluation);
adminAssistantRoutes.post("/assistant-evaluations/run", runAssistantEvaluationNow);
adminAssistantRoutes.get("/assistant-conversations", listAssistantConversations);
adminAssistantRoutes.get("/assistant-conversations/analysis", analyseLiveAssistantConversations);

export default adminAssistantRoutes;
