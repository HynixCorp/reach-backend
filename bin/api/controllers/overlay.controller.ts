/**
 * Overlay Controller
 * REST API endpoints for the game overlay system
 * Supports targeting: user (Minecraft UUID), experience (instance), or global (all Reach users)
 */
import "colorts/lib/string";
import { Request, Response } from "express";
import { createSuccessResponse, createErrorResponse } from "../../common/utils";
import { ResponseHandler, asyncHandler } from "../../common/services/response.service";
import { validateRequest } from "../../common/services/validation.service";
import {
  sendAchievementUnlock,
  sendToast,
  sendOverlayCommand,
  getOverlayStats,
  getAllPresences,
  getPresence,
  createAchievement,
  getAllAchievements,
  getAchievementById,
  unlockAchievement,
  getUserAchievements,
  getUsersInExperience,
  getAllExperiences,
  getExperienceUserCount,
} from "../../common/services/overlay.service";
import { ToastPayload, AchievementUnlockPayload, OverlayCommand, MessageTarget, MessageTargetType } from "../../types/overlay";
import { nanoid } from "nanoid";

// ============ Helper Functions ============

/**
 * Parse target from request body
 * Supports: { target: { type: "user"|"experience"|"global", id?: string } }
 * Or legacy: userId param for backwards compatibility
 */
function parseTarget(req: Request, userIdParam?: string): MessageTarget | null {
  // New format: target object in body
  if (req.body.target) {
    const { type, id } = req.body.target;
    const validTypes: MessageTargetType[] = ["user", "experience", "global"];
    
    if (!validTypes.includes(type)) {
      return null;
    }
    
    if ((type === "user" || type === "experience") && !id) {
      return null;
    }
    
    return { type, id };
  }
  
  // Legacy format: userId in URL params
  if (userIdParam) {
    return { type: "user", id: userIdParam };
  }
  
  return null;
}

// ============ Achievement Endpoints ============

/**
 * POST /api/overlay/v0/achievement/send
 * Send achievement unlock notification to target (user/experience/global)
 * Body: { title, description, icon?, rarity?, target: { type, id? } }
 */
async function sendAchievementToTarget(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["title", "description", "target"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const target = parseTarget(req);
  if (!target) {
    return ResponseHandler.badRequest(res, "Invalid target. Use { type: 'user'|'experience'|'global', id?: string }");
  }
  
  const { title, description, icon, rarity } = req.body as AchievementUnlockPayload;
  
  const result = sendAchievementUnlock(target, { title, description, icon, rarity });
  
  if (!result.success) {
    return res.status(404).json(
      createErrorResponse(`No recipients found for target`, 404)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse(
      { sent: true, target, recipients: result.recipients },
      "Achievement notification sent"
    )
  );
}

/**
 * POST /api/overlay/v0/achievement/:userId
 * Send achievement unlock notification to a specific user (legacy endpoint)
 */
async function sendAchievementToUser(req: Request, res: Response): Promise<Response> {
  const { userId } = req.params;
  
  const validation = validateRequest(req, {
    requiredBody: ["title", "description"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const { title, description, icon, rarity } = req.body as AchievementUnlockPayload;
  
  const result = sendAchievementUnlock({ type: "user", id: userId }, { title, description, icon, rarity });
  
  if (!result.success) {
    return res.status(404).json(
      createErrorResponse(`User ${userId} is not connected`, 404)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse({ sent: true, userId, recipients: result.recipients }, "Achievement notification sent")
  );
}

/**
 * POST /api/overlay/v0/achievements
 * Register a new achievement in the system
 */
async function registerAchievement(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["title", "description"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const { title, description, icon, category, rarity, points, serverId, isGlobal } = req.body;
  
  const achievementId = nanoid(12);
  
  const achievement = await createAchievement({
    id: achievementId,
    title,
    description,
    icon,
    category,
    rarity: rarity || "common",
    points: points || 10,
    serverId,
    isGlobal: isGlobal !== false,
  });
  
  return res.status(201).json(
    createSuccessResponse(achievement, "Achievement registered successfully")
  );
}

/**
 * GET /api/overlay/v0/achievements
 * Get all registered achievements
 */
async function getAchievements(req: Request, res: Response): Promise<Response> {
  const achievements = await getAllAchievements();
  
  return res.status(200).json(
    createSuccessResponse(achievements, "Achievements retrieved successfully")
  );
}

/**
 * GET /api/overlay/v0/achievements/:achievementId
 * Get a specific achievement by ID
 */
async function getAchievement(req: Request, res: Response): Promise<Response> {
  const { achievementId } = req.params;
  
  const achievement = await getAchievementById(achievementId);
  
  if (!achievement) {
    return ResponseHandler.notFound(res, "Achievement");
  }
  
  return res.status(200).json(
    createSuccessResponse(achievement, "Achievement retrieved successfully")
  );
}

/**
 * POST /api/overlay/v0/achievements/:achievementId/unlock/:userId
 * Unlock an achievement for a user (stores in DB and notifies)
 */
async function unlockAchievementForUser(req: Request, res: Response): Promise<Response> {
  const { achievementId, userId } = req.params;
  const { serverId } = req.body;
  
  const success = await unlockAchievement(userId, achievementId, serverId);
  
  if (!success) {
    return res.status(400).json(
      createErrorResponse("Achievement not found or already unlocked", 400)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse({ unlocked: true, achievementId, userId }, "Achievement unlocked")
  );
}

/**
 * GET /api/overlay/v0/users/:userId/achievements
 * Get all achievements unlocked by a user
 */
async function getUserUnlockedAchievements(req: Request, res: Response): Promise<Response> {
  const { userId } = req.params;
  
  const achievements = await getUserAchievements(userId);
  
  return res.status(200).json(
    createSuccessResponse(achievements, "User achievements retrieved successfully")
  );
}

// ============ Toast Endpoints ============

/**
 * POST /api/overlay/v0/toast/send
 * Send a toast notification to target (user/experience/global)
 * Body: { title, description, duration?, type?, target: { type, id? } }
 */
async function sendToastToTarget(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["title", "description", "target"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const target = parseTarget(req);
  if (!target) {
    return ResponseHandler.badRequest(res, "Invalid target. Use { type: 'user'|'experience'|'global', id?: string }");
  }
  
  const { title, description, duration, type } = req.body as ToastPayload;
  
  const result = sendToast(target, {
    title,
    description,
    duration: duration || 5000,
    type: type || "info",
  });
  
  if (!result.success) {
    return res.status(404).json(
      createErrorResponse(`No recipients found for target`, 404)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse(
      { sent: true, target, recipients: result.recipients },
      "Toast notification sent"
    )
  );
}

/**
 * POST /api/overlay/v0/toast/:userId
 * Send a toast notification to a specific user (legacy endpoint)
 */
async function sendToastToUser(req: Request, res: Response): Promise<Response> {
  const { userId } = req.params;
  
  const validation = validateRequest(req, {
    requiredBody: ["title", "description"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const { title, description, duration, type } = req.body as ToastPayload;
  
  const result = sendToast({ type: "user", id: userId }, {
    title,
    description,
    duration: duration || 5000,
    type: type || "info",
  });
  
  if (!result.success) {
    return res.status(404).json(
      createErrorResponse(`User ${userId} is not connected`, 404)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse({ sent: true, userId, recipients: result.recipients }, "Toast notification sent")
  );
}

/**
 * POST /api/overlay/v0/toast/experience/:experienceId
 * Send a toast notification to all users in an experience
 */
async function sendToastToExperience(req: Request, res: Response): Promise<Response> {
  const { experienceId } = req.params;
  
  const validation = validateRequest(req, {
    requiredBody: ["title", "description"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const { title, description, duration, type } = req.body as ToastPayload;
  
  const result = sendToast({ type: "experience", id: experienceId }, {
    title,
    description,
    duration: duration || 5000,
    type: type || "info",
  });
  
  if (!result.success) {
    return res.status(404).json(
      createErrorResponse(`No users in experience ${experienceId}`, 404)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse(
      { sent: true, experienceId, recipients: result.recipients },
      "Toast sent to experience"
    )
  );
}

/**
 * POST /api/overlay/v0/toast/broadcast
 * Send a toast notification to all connected users (global)
 */
async function broadcastToastToAll(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["title", "description"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const { title, description, duration, type } = req.body as ToastPayload;
  
  const result = sendToast({ type: "global" }, {
    title,
    description,
    duration: duration || 5000,
    type: type || "info",
  });
  
  return res.status(200).json(
    createSuccessResponse(
      { sent: true, recipients: result.recipients },
      "Toast broadcasted to all connected users"
    )
  );
}

// ============ Overlay Command Endpoints ============

/**
 * POST /api/overlay/v0/command/send
 * Send an overlay command to target (user/experience/global)
 * Body: { command: "open"|"close"|"refresh"|"toggle", target: { type, id? } }
 */
async function sendCommandToTarget(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["command", "target"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const target = parseTarget(req);
  if (!target) {
    return ResponseHandler.badRequest(res, "Invalid target. Use { type: 'user'|'experience'|'global', id?: string }");
  }
  
  const { command } = req.body;
  const validCommands: OverlayCommand[] = ["open", "close", "refresh", "toggle"];
  
  if (!validCommands.includes(command)) {
    return ResponseHandler.badRequest(res, `Invalid command. Valid commands: ${validCommands.join(", ")}`);
  }
  
  const result = sendOverlayCommand(target, command);
  
  if (!result.success) {
    return res.status(404).json(
      createErrorResponse(`No recipients found for target`, 404)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse(
      { sent: true, command, target, recipients: result.recipients },
      "Command sent"
    )
  );
}

/**
 * POST /api/overlay/v0/command/:userId
 * Send an overlay command to a specific user (legacy endpoint)
 */
async function sendCommandToUser(req: Request, res: Response): Promise<Response> {
  const { userId } = req.params;
  
  const validation = validateRequest(req, {
    requiredBody: ["command"],
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  const { command } = req.body;
  const validCommands: OverlayCommand[] = ["open", "close", "refresh", "toggle"];
  
  if (!validCommands.includes(command)) {
    return ResponseHandler.badRequest(res, `Invalid command. Valid commands: ${validCommands.join(", ")}`);
  }
  
  const result = sendOverlayCommand({ type: "user", id: userId }, command);
  
  if (!result.success) {
    return res.status(404).json(
      createErrorResponse(`User ${userId} is not connected`, 404)
    );
  }
  
  return res.status(200).json(
    createSuccessResponse({ sent: true, userId, command, recipients: result.recipients }, "Command sent")
  );
}

// ============ Presence & Experience Endpoints ============

/**
 * GET /api/overlay/v0/presence/:userId
 * Get presence status of a specific user
 */
async function getUserPresence(req: Request, res: Response): Promise<Response> {
  const { userId } = req.params;
  
  const presence = getPresence(userId);
  
  if (!presence) {
    return res.status(200).json(
      createSuccessResponse(
        { userId, status: "offline", connected: false },
        "User is offline"
      )
    );
  }
  
  return res.status(200).json(
    createSuccessResponse(
      {
        userId: presence.userId,
        status: presence.status,
        details: presence.details,
        experienceId: presence.experienceId,
        connected: true,
        connectedAt: presence.connectedAt,
        lastUpdate: presence.lastUpdate,
      },
      "Presence retrieved"
    )
  );
}

/**
 * GET /api/overlay/v0/presence
 * Get all connected users' presence
 */
async function getAllPresenceStatus(req: Request, res: Response): Promise<Response> {
  const presences = getAllPresences();
  
  const formattedPresences = presences.map(p => ({
    userId: p.userId,
    status: p.status,
    details: p.details,
    experienceId: p.experienceId,
    connectedAt: p.connectedAt,
    lastUpdate: p.lastUpdate,
  }));
  
  return res.status(200).json(
    createSuccessResponse(formattedPresences, "All presences retrieved")
  );
}

/**
 * GET /api/overlay/v0/experiences
 * Get all active experiences with user counts
 */
async function getExperiences(req: Request, res: Response): Promise<Response> {
  const experiences = getAllExperiences();
  
  return res.status(200).json(
    createSuccessResponse(experiences, "Active experiences retrieved")
  );
}

/**
 * GET /api/overlay/v0/experiences/:experienceId
 * Get details of a specific experience including connected users
 */
async function getExperienceDetails(req: Request, res: Response): Promise<Response> {
  const { experienceId } = req.params;
  
  const users = getUsersInExperience(experienceId);
  const userCount = getExperienceUserCount(experienceId);
  
  return res.status(200).json(
    createSuccessResponse(
      {
        experienceId,
        userCount,
        users,
      },
      "Experience details retrieved"
    )
  );
}

/**
 * GET /api/overlay/v0/stats
 * Get overlay statistics
 */
async function getStats(req: Request, res: Response): Promise<Response> {
  const stats = getOverlayStats();
  
  return res.status(200).json(
    createSuccessResponse(stats, "Overlay statistics retrieved")
  );
}

// ============ Health Check ============

/**
 * GET /api/overlay/v0/health
 * Health check for overlay service
 */
async function healthCheck(req: Request, res: Response): Promise<Response> {
  const stats = getOverlayStats();
  
  return res.status(200).json(
    createSuccessResponse(
      {
        status: "healthy",
        service: "overlay",
        connectedUsers: stats.connectedUsers,
        activeExperiences: stats.activeExperiences,
        uptime: process.uptime(),
      },
      "Overlay service is healthy"
    )
  );
}

// Export wrapped handlers
module.exports = {
  // Achievements
  sendAchievementToTarget: asyncHandler(sendAchievementToTarget),
  sendAchievementToUser: asyncHandler(sendAchievementToUser),
  registerAchievement: asyncHandler(registerAchievement),
  getAchievements: asyncHandler(getAchievements),
  getAchievement: asyncHandler(getAchievement),
  unlockAchievementForUser: asyncHandler(unlockAchievementForUser),
  getUserUnlockedAchievements: asyncHandler(getUserUnlockedAchievements),
  
  // Toasts
  sendToastToTarget: asyncHandler(sendToastToTarget),
  sendToastToUser: asyncHandler(sendToastToUser),
  sendToastToExperience: asyncHandler(sendToastToExperience),
  broadcastToastToAll: asyncHandler(broadcastToastToAll),
  
  // Commands
  sendCommandToTarget: asyncHandler(sendCommandToTarget),
  sendCommandToUser: asyncHandler(sendCommandToUser),
  
  // Presence & Experiences
  getUserPresence: asyncHandler(getUserPresence),
  getAllPresenceStatus: asyncHandler(getAllPresenceStatus),
  getExperiences: asyncHandler(getExperiences),
  getExperienceDetails: asyncHandler(getExperienceDetails),
  
  // Stats & Health
  getStats: asyncHandler(getStats),
  healthCheck: asyncHandler(healthCheck),
};
