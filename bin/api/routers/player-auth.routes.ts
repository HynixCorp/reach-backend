/**
 * Player Authentication Routes
 * 
 * Routes for Xbox/Microsoft authentication (Minecraft launcher users).
 * 
 * OAuth Flow:
 * 1. GET  /api/auth/player/sign-in/microsoft  - Initiate Microsoft OAuth (Better-Auth)
 * 2. GET  /api/auth/player/callback/microsoft - OAuth callback (Better-Auth)
 * 3. POST /api/v0/auth/player/xbox/complete   - Complete Xbox auth after OAuth
 * 
 * API Routes:
 * - GET    /api/v0/auth/player/profile        - Get player profile
 * - POST   /api/v0/auth/player/refresh        - Refresh Minecraft token
 * - POST   /api/v0/auth/player/logout         - Logout player
 * - POST   /api/v0/auth/player/link-developer - Link to developer account
 * - DELETE /api/v0/auth/player/link-developer - Unlink from developer account
 */

import "colorts/lib/string";
import { Router, Request, Response, NextFunction } from "express";
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
 * 
 * IMPORTANT: We mount without a prefix and let Better-Auth handle routing internally
 * because it expects req.url to contain the full path matching its basePath config.
 */

// Debug endpoint to check Better-Auth status
playerAuthRouter.get("/api/auth/player/debug", (req: Request, res: Response) => {
  res.json({
    message: "Better-Auth Player Debug",
    basePath: "/api/auth/player",
    availableEndpoints: [
      "POST /api/auth/player/sign-in/social (body: {provider: 'microsoft', callbackURL: '/'})",
      "GET /api/auth/player/callback/microsoft",
      "GET /api/auth/player/session",
      "POST /api/auth/player/sign-out"
    ],
    microsoftConfigured: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    testUrl: "/api/auth/player/microsoft-redirect"
  });
});

// Convenience redirect endpoint for browser testing
playerAuthRouter.get("/api/auth/player/microsoft-redirect", async (req: Request, res: Response) => {
  // Create the OAuth URL manually for GET requests (browser navigation)
  const callbackURL = req.query.callbackURL as string || "/";
  const baseURL = process.env.BASE_URL || "http://localhost:8080";
  
  // Redirect to Microsoft OAuth
  const microsoftAuthUrl = new URL("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
  microsoftAuthUrl.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID || "");
  microsoftAuthUrl.searchParams.set("response_type", "code");
  microsoftAuthUrl.searchParams.set("redirect_uri", `${baseURL}/api/auth/player/callback/microsoft`);
  microsoftAuthUrl.searchParams.set("scope", "openid profile email offline_access");
  microsoftAuthUrl.searchParams.set("response_mode", "query");
  microsoftAuthUrl.searchParams.set("state", Buffer.from(JSON.stringify({ callbackURL })).toString("base64"));
  
  console.log(`[Player Auth] Redirecting to Microsoft OAuth: ${microsoftAuthUrl.toString()}`.cyan);
  res.redirect(microsoftAuthUrl.toString());
});

playerAuthRouter.use((req: Request, res: Response, next: NextFunction) => {
  // Only handle requests that start with /api/auth/player (but not /api/auth/player/debug)
  if (req.originalUrl.startsWith("/api/auth/player") && !req.originalUrl.includes("/debug")) {
    console.log(`[Player Auth] Handling Better-Auth request: ${req.method} ${req.originalUrl}`.cyan);
    console.log(`[Player Auth] req.url: ${req.url}`.gray);
    console.log(`[Player Auth] req.path: ${req.path}`.gray);
    return toNodeHandler(playerAuth)(req, res);
  }
  next();
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
