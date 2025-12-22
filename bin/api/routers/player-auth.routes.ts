/**
 * Player Authentication Routes
 * 
 * Routes for Xbox/Microsoft authentication (Minecraft launcher users).
 * 
 * OAuth Flow:
 * 1. GET  /api/auth/player/microsoft     - Initiate Microsoft OAuth (Better-Auth)
 * 2. GET  /api/auth/player/callback/*    - OAuth callback (Better-Auth)
 * 3. POST /api/v0/auth/player/xbox/complete - Complete Xbox auth after OAuth
 * 
 * API Routes:
 * - GET    /api/v0/auth/player/profile        - Get player profile
 * - POST   /api/v0/auth/player/refresh        - Refresh Minecraft token
 * - POST   /api/v0/auth/player/logout         - Logout player
 * - POST   /api/v0/auth/player/link-developer - Link to developer account
 * - DELETE /api/v0/auth/player/link-developer - Unlink from developer account
 */

import { Router, Request, Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { playerAuth } from "../../common/auth/better-auth.config";
import { asyncHandler } from "../../common/services/response.service";
import {
  completeXboxAuth,
  getPlayerProfile,
  linkDeveloperAccount,
  unlinkDeveloperAccount,
  refreshMinecraftToken,
  logoutPlayer
} from "../controllers/player-auth.controller";

const playerAuthRouter = Router();

/**
 * Better-Auth OAuth routes
 * 
 * These handle the Microsoft OAuth flow:
 * - /api/auth/player/* - All Better-Auth endpoints
 * 
 * Note: These routes bypass the standard middleware (user-agent check, etc.)
 * because they need to handle browser redirects.
 */
playerAuthRouter.all("/api/auth/player/{*splat}", (req: Request, res: Response) => {
  return toNodeHandler(playerAuth)(req, res);
});

/**
 * Xbox authentication completion
 * Called after Microsoft OAuth to exchange tokens for Xbox/Minecraft credentials
 */
playerAuthRouter.post(
  "/api/v0/auth/player/xbox/complete",
  asyncHandler(completeXboxAuth)
);

/**
 * Get player profile
 */
playerAuthRouter.get(
  "/api/v0/auth/player/profile",
  asyncHandler(getPlayerProfile)
);

/**
 * Refresh Minecraft token
 */
playerAuthRouter.post(
  "/api/v0/auth/player/refresh",
  asyncHandler(refreshMinecraftToken)
);

/**
 * Logout player
 */
playerAuthRouter.post(
  "/api/v0/auth/player/logout",
  asyncHandler(logoutPlayer)
);

/**
 * Link Xbox account to developer account
 */
playerAuthRouter.post(
  "/api/v0/auth/player/link-developer",
  asyncHandler(linkDeveloperAccount)
);

/**
 * Unlink Xbox account from developer account
 */
playerAuthRouter.delete(
  "/api/v0/auth/player/link-developer",
  asyncHandler(unlinkDeveloperAccount)
);

export default playerAuthRouter;
