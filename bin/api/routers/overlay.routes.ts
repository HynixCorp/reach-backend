/**
 * Overlay Routes
 * REST API routes for the game overlay system
 * Supports targeting: user (Minecraft UUID), experience (instance), or global (all Reach users)
 * 
 * Authentication:
 * - Public endpoints: health, stats, presence, get achievements
 * - Protected endpoints (require x-overlay-token): unlock achievements, send notifications
 * 
 * Development mode: Authentication is relaxed (warnings only)
 * Production mode: Authentication is required for protected endpoints
 */
import express, { Request, Response, NextFunction } from "express";
import { 
  overlayServerAuth as originalOverlayServerAuth, 
  overlayServerAuthOptional,
  DEMO_SERVER_TOKEN 
} from "../../common/middlewares/overlay.auth.middleware";

// Wrap middleware to ensure void return type for Express compatibility
const overlayServerAuth = (req: Request, res: Response, next: NextFunction): void => {
  originalOverlayServerAuth(req, res, next);
};

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/overlay.controller");

// Log demo token on startup for development
if (process.env.NODE_ENV !== "production") {
  console.log(`[REACH - Overlay Routes] 🔑 Demo Token for testing: ${DEMO_SERVER_TOKEN}`.cyan);
}

// ============ Public Endpoints (No Auth Required) ============

// Health Check
ROUTER.get("/health", CONTROLLER.healthCheck);

// Statistics
ROUTER.get("/stats", CONTROLLER.getStats);

// Presence (read-only)
ROUTER.get("/presence", CONTROLLER.getAllPresenceStatus);
ROUTER.get("/presence/:userId", CONTROLLER.getUserPresence);

// Experiences (read-only)
ROUTER.get("/experiences", CONTROLLER.getExperiences);
ROUTER.get("/experiences/:experienceId", CONTROLLER.getExperienceDetails);

// Get achievements (read-only)
ROUTER.get("/achievements", CONTROLLER.getAchievements);
ROUTER.get("/achievements/:achievementId", CONTROLLER.getAchievement);
ROUTER.get("/users/:userId/achievements", CONTROLLER.getUserUnlockedAchievements);

// ============ Protected Endpoints (Server Token Required) ============
// These require the x-overlay-token header
// In development: works without token but logs warning
// In production: requires valid token

// Register new achievement (server-side only)
ROUTER.post("/achievements", overlayServerAuth, CONTROLLER.registerAchievement);

// Unlock achievement for user (server-side only)
ROUTER.post("/achievements/:achievementId/unlock/:userId", overlayServerAuth, CONTROLLER.unlockAchievementForUser);

// Send achievement notification with targeting
ROUTER.post("/achievement/send", overlayServerAuth, CONTROLLER.sendAchievementToTarget);

// Send achievement notification to specific user (legacy)
ROUTER.post("/achievement/:userId", overlayServerAuth, CONTROLLER.sendAchievementToUser);

// Send toast with targeting
ROUTER.post("/toast/send", overlayServerAuth, CONTROLLER.sendToastToTarget);

// Broadcast toast to all users
ROUTER.post("/toast/broadcast", overlayServerAuth, CONTROLLER.broadcastToastToAll);

// Send toast to specific experience
ROUTER.post("/toast/experience/:experienceId", overlayServerAuth, CONTROLLER.sendToastToExperience);

// Send toast to specific user (legacy)
ROUTER.post("/toast/:userId", overlayServerAuth, CONTROLLER.sendToastToUser);

// Send command with targeting
ROUTER.post("/command/send", overlayServerAuth, CONTROLLER.sendCommandToTarget);

// Send command to specific user (legacy)
ROUTER.post("/command/:userId", overlayServerAuth, CONTROLLER.sendCommandToUser);

export { ROUTER as OVERLAY_ROUTER };
export default ROUTER;
