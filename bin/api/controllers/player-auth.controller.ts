/**
 * Player Authentication Controller
 * 
 * Handles Xbox/Microsoft authentication for players (Minecraft launcher users).
 * This is separate from developer authentication (web dashboard).
 * 
 * Flow:
 * 1. Client initiates Microsoft OAuth via Better-Auth
 * 2. After OAuth, client calls /xbox/complete with the session
 * 3. Server exchanges tokens for Xbox Live -> XSTS -> Minecraft
 * 4. Player profile is created/updated in reach_players database
 * 
 * Database: reach_players
 * Collections: players, sessions, inventory
 */

import { Request, Response } from "express";
import { createSuccessResponse, createErrorResponse } from "../../common/utils";
import { getPlayersDB, getDevelopersDB } from "../../common/services/database.service";
import { validateRequest } from "../../common/services/validation.service";
import { ResponseHandler } from "../../common/services/response.service";
import { 
  authenticateWithXbox, 
  formatUuid,
  XboxAuthResult 
} from "../../common/auth/xbox.service";
import { playerAuth } from "../../common/auth/better-auth.config";
import { PlayerProfile, PlayerSession, LinkedXboxAccount } from "../../types/player";
import "colorts/lib/string";

const PLAYERS_DB = getPlayersDB();
const DEVELOPERS_DB = getDevelopersDB();

/**
 * Complete Xbox authentication after Microsoft OAuth
 * 
 * POST /api/v0/auth/player/xbox/complete
 * Body: { sessionToken: string }
 * 
 * This endpoint is called after the client completes Microsoft OAuth.
 * It exchanges the Microsoft token for Xbox Live and Minecraft credentials.
 */
async function completeXboxAuth(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["sessionToken"]
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { sessionToken } = req.body;

  try {
    // Verify the session with Better-Auth
    const session = await playerAuth.api.getSession({
      headers: {
        Authorization: `Bearer ${sessionToken}`
      }
    });

    if (!session || !session.session) {
      return ResponseHandler.unauthorized(res, "Invalid or expired session");
    }

    // Get the Microsoft access token from the account
    const accounts = await PLAYERS_DB.findDocuments("accounts", {
      userId: session.user.id,
      providerId: "microsoft"
    });

    if (accounts.length === 0) {
      return ResponseHandler.badRequest(res, "No Microsoft account linked to this session");
    }

    const msAccessToken = accounts[0].accessToken;
    
    if (!msAccessToken) {
      return ResponseHandler.badRequest(res, "Microsoft access token not found. Please re-authenticate.");
    }

    // Complete Xbox authentication flow
    console.log(`[Player Auth] Completing Xbox auth for session ${session.session.id}`.cyan);
    const xboxResult = await authenticateWithXbox(msAccessToken);

    if (!xboxResult.success) {
      return res.status(400).json(
        createErrorResponse(xboxResult.error || "Xbox authentication failed", 400)
      );
    }

    // Update player profile with Xbox/Minecraft data
    const playerUpdate: Partial<PlayerProfile> = {
      xboxGamertag: xboxResult.xstsToken?.gamertag,
      xboxUserId: xboxResult.xstsToken?.xuid,
      updatedAt: new Date()
    };

    if (xboxResult.profile && xboxResult.ownsMinecraft) {
      playerUpdate.minecraftUuid = formatUuid(xboxResult.profile.id);
      playerUpdate.minecraftUsername = xboxResult.profile.name;
      playerUpdate.ownsMinecraft = true;
    } else {
      playerUpdate.ownsMinecraft = false;
    }

    // Update player in database
    await PLAYERS_DB.updateDocument(
      "players",
      { id: session.user.id },
      playerUpdate
    );

    // Store Minecraft token for future API calls
    if (xboxResult.minecraftToken) {
      await PLAYERS_DB.updateDocument(
        "sessions",
        { id: session.session.id },
        {
          minecraftAccessToken: xboxResult.minecraftToken.accessToken,
          minecraftTokenExpiresAt: xboxResult.minecraftToken.expiresOn,
          xboxUserHash: xboxResult.xstsToken?.userHash
        }
      );
    }

    console.log(`[Player Auth] Xbox auth completed for ${xboxResult.xstsToken?.gamertag}`.green);

    return res.status(200).json(
      createSuccessResponse({
        gamertag: xboxResult.xstsToken?.gamertag,
        xuid: xboxResult.xstsToken?.xuid,
        minecraftUuid: playerUpdate.minecraftUuid,
        minecraftUsername: playerUpdate.minecraftUsername,
        ownsMinecraft: playerUpdate.ownsMinecraft
      }, "Xbox authentication completed successfully")
    );

  } catch (error: any) {
    console.error("[Player Auth] Xbox auth error:".red, error.message);
    return res.status(500).json(
      createErrorResponse("Failed to complete Xbox authentication", 500)
    );
  }
}

/**
 * Get player profile
 * 
 * GET /api/v0/auth/player/profile
 * Headers: Authorization: Bearer <sessionToken>
 */
async function getPlayerProfile(req: Request, res: Response): Promise<Response> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return ResponseHandler.unauthorized(res, "Missing authorization header");
  }

  const sessionToken = authHeader.split(" ")[1];

  try {
    const session = await playerAuth.api.getSession({
      headers: {
        Authorization: `Bearer ${sessionToken}`
      }
    });

    if (!session || !session.user) {
      return ResponseHandler.unauthorized(res, "Invalid or expired session");
    }

    const players = await PLAYERS_DB.findDocuments("players", { id: session.user.id });
    
    if (players.length === 0) {
      return ResponseHandler.notFound(res, "Player profile");
    }

    const player = players[0];
    
    // Remove sensitive fields
    const { _id, ...profile } = player;

    return res.status(200).json(
      createSuccessResponse(profile, "Player profile retrieved successfully")
    );

  } catch (error: any) {
    console.error("[Player Auth] Get profile error:".red, error.message);
    return res.status(500).json(
      createErrorResponse("Failed to retrieve player profile", 500)
    );
  }
}

/**
 * Link Xbox account to developer account
 * 
 * POST /api/v0/auth/player/link-developer
 * Body: { developerSessionToken: string, playerSessionToken: string }
 * 
 * Allows a player to link their Xbox account to a developer account
 * for creator benefits and analytics access.
 */
async function linkDeveloperAccount(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["developerSessionToken", "playerSessionToken"]
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { developerSessionToken, playerSessionToken } = req.body;

  try {
    // Verify player session
    const playerSession = await playerAuth.api.getSession({
      headers: {
        Authorization: `Bearer ${playerSessionToken}`
      }
    });

    if (!playerSession?.user) {
      return ResponseHandler.unauthorized(res, "Invalid player session");
    }

    // Verify developer session (using developerAuth would need import)
    // For now, verify directly in database
    const developerSessions = await DEVELOPERS_DB.findDocuments("sessions", {
      token: developerSessionToken
    });

    if (developerSessions.length === 0) {
      return ResponseHandler.unauthorized(res, "Invalid developer session");
    }

    const developerSession = developerSessions[0];
    
    // Check if already linked
    const existingLink = await DEVELOPERS_DB.findDocuments("linkedXboxAccounts", {
      $or: [
        { developerId: developerSession.userId },
        { playerId: playerSession.user.id }
      ]
    });

    if (existingLink.length > 0) {
      return ResponseHandler.badRequest(res, "Account is already linked to another account");
    }

    // Get player data
    const players = await PLAYERS_DB.findDocuments("players", { id: playerSession.user.id });
    if (players.length === 0) {
      return ResponseHandler.notFound(res, "Player profile");
    }

    const player = players[0];

    // Create link record
    const link: LinkedXboxAccount = {
      id: `link_${Date.now()}`,
      developerId: developerSession.userId,
      playerId: playerSession.user.id,
      xboxGamertag: player.xboxGamertag || "",
      xboxUserId: player.xboxUserId || "",
      minecraftUuid: player.minecraftUuid,
      linkedAt: new Date()
    };

    await DEVELOPERS_DB.insertDocument("linkedXboxAccounts", link);

    // Update player with linked developer account
    await PLAYERS_DB.updateDocument(
      "players",
      { id: playerSession.user.id },
      { linkedDeveloperAccountId: developerSession.userId }
    );

    console.log(`[Player Auth] Linked Xbox account ${player.xboxGamertag} to developer ${developerSession.userId}`.green);

    return res.status(200).json(
      createSuccessResponse({
        linkId: link.id,
        gamertag: player.xboxGamertag,
        linkedAt: link.linkedAt
      }, "Accounts linked successfully")
    );

  } catch (error: any) {
    console.error("[Player Auth] Link account error:".red, error.message);
    return res.status(500).json(
      createErrorResponse("Failed to link accounts", 500)
    );
  }
}

/**
 * Unlink Xbox account from developer account
 * 
 * DELETE /api/v0/auth/player/link-developer
 * Headers: Authorization: Bearer <playerSessionToken>
 */
async function unlinkDeveloperAccount(req: Request, res: Response): Promise<Response> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return ResponseHandler.unauthorized(res, "Missing authorization header");
  }

  const playerSessionToken = authHeader.split(" ")[1];

  try {
    const playerSession = await playerAuth.api.getSession({
      headers: {
        Authorization: `Bearer ${playerSessionToken}`
      }
    });

    if (!playerSession?.user) {
      return ResponseHandler.unauthorized(res, "Invalid player session");
    }

    // Check if link exists
    const existingLinks = await DEVELOPERS_DB.findDocuments("linkedXboxAccounts", {
      playerId: playerSession.user.id
    });

    if (existingLinks.length === 0) {
      return ResponseHandler.notFound(res, "Account link");
    }

    // Remove link
    await DEVELOPERS_DB.deleteDocument("linkedXboxAccounts", {
      playerId: playerSession.user.id
    });

    // Update player
    await PLAYERS_DB.updateDocument(
      "players",
      { id: playerSession.user.id },
      { linkedDeveloperAccountId: null }
    );

    console.log(`[Player Auth] Unlinked Xbox account for player ${playerSession.user.id}`.yellow);

    return res.status(200).json(
      createSuccessResponse(null, "Account unlinked successfully")
    );

  } catch (error: any) {
    console.error("[Player Auth] Unlink account error:".red, error.message);
    return res.status(500).json(
      createErrorResponse("Failed to unlink accounts", 500)
    );
  }
}

/**
 * Refresh Minecraft token
 * 
 * POST /api/v0/auth/player/refresh
 * Headers: Authorization: Bearer <sessionToken>
 * 
 * Refreshes the Minecraft access token using the stored Microsoft token.
 */
async function refreshMinecraftToken(req: Request, res: Response): Promise<Response> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return ResponseHandler.unauthorized(res, "Missing authorization header");
  }

  const sessionToken = authHeader.split(" ")[1];

  try {
    const session = await playerAuth.api.getSession({
      headers: {
        Authorization: `Bearer ${sessionToken}`
      }
    });

    if (!session?.session) {
      return ResponseHandler.unauthorized(res, "Invalid or expired session");
    }

    // Get Microsoft token
    const accounts = await PLAYERS_DB.findDocuments("accounts", {
      userId: session.user.id,
      providerId: "microsoft"
    });

    if (accounts.length === 0 || !accounts[0].accessToken) {
      return ResponseHandler.badRequest(res, "Please re-authenticate with Microsoft");
    }

    // Re-authenticate with Xbox
    const xboxResult = await authenticateWithXbox(accounts[0].accessToken);

    if (!xboxResult.success) {
      return res.status(400).json(
        createErrorResponse(xboxResult.error || "Token refresh failed", 400)
      );
    }

    // Update session with new token
    if (xboxResult.minecraftToken) {
      await PLAYERS_DB.updateDocument(
        "sessions",
        { id: session.session.id },
        {
          minecraftAccessToken: xboxResult.minecraftToken.accessToken,
          minecraftTokenExpiresAt: xboxResult.minecraftToken.expiresOn
        }
      );
    }

    return res.status(200).json(
      createSuccessResponse({
        minecraftToken: xboxResult.minecraftToken?.accessToken,
        expiresAt: xboxResult.minecraftToken?.expiresOn
      }, "Token refreshed successfully")
    );

  } catch (error: any) {
    console.error("[Player Auth] Token refresh error:".red, error.message);
    return res.status(500).json(
      createErrorResponse("Failed to refresh token", 500)
    );
  }
}

/**
 * Logout player (revoke session)
 * 
 * POST /api/v0/auth/player/logout
 * Headers: Authorization: Bearer <sessionToken>
 */
async function logoutPlayer(req: Request, res: Response): Promise<Response> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return ResponseHandler.unauthorized(res, "Missing authorization header");
  }

  const sessionToken = authHeader.split(" ")[1];

  try {
    // Revoke session via Better-Auth
    await playerAuth.api.signOut({
      headers: {
        Authorization: `Bearer ${sessionToken}`
      }
    });

    return res.status(200).json(
      createSuccessResponse(null, "Logged out successfully")
    );

  } catch (error: any) {
    console.error("[Player Auth] Logout error:".red, error.message);
    return res.status(500).json(
      createErrorResponse("Failed to logout", 500)
    );
  }
}

export {
  completeXboxAuth,
  getPlayerProfile,
  linkDeveloperAccount,
  unlinkDeveloperAccount,
  refreshMinecraftToken,
  logoutPlayer
};
