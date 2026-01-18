import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { createSuccessResponse, createGenericResponse } from "../../common/utils";
import { UserPacket } from "../../types/auth";
import getMinecraftUUID from "../../common/mcResources/uuid";
import { getDevelopersDB, getPlayersDB } from "../../common/services/database.service";
import { validateRequest } from "../../common/services/validation.service";
import { ResponseHandler } from "../../common/services/response.service";
import { logger } from "../../common/services/logger.service";

// reach_players - For Xbox/Minecraft player profiles
const PLAYERS_DB = getPlayersDB();
// reach_developers - For Better-Auth developer accounts
const DEVELOPERS_DB = getDevelopersDB();

async function createNewUserData(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["username", "uuid"],
    requiredHeaders: ["machine-id", "device-id"]
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { username, uuid } = req.body;
  const headerMachineId = req.headers["machine-id"] as string;
  const headerDeviceId = req.headers["device-id"] as string;

  const uuidAPI = await getMinecraftUUID(username);
  
  if (!uuidAPI) {
    return ResponseHandler.notFound(res, `User with username ${username}`);
  }

  if (uuid !== uuidAPI) {
    return ResponseHandler.badRequest(res, "UUID is invalid or not found.");
  }

  const existingUser = await PLAYERS_DB.findDocuments("players", { minecraftUuid: uuidAPI });

  if (existingUser.length > 0) {
    return res.status(200).json(
      createSuccessResponse(null, "[REACHX - Auth]: User already exists.")
    );
  }
  
  const createPacket: UserPacket = {
    id: uuidv4(),
    username,
    banned: "none",
    uuid: uuidAPI,
    createdAt: new Date(),
    machineId: headerMachineId,
    deviceId: headerDeviceId,
  };

  await PLAYERS_DB.insertDocument("players", createPacket);

  return res.status(201).json(
    createSuccessResponse(createPacket, "[REACHX - Auth]: User created successfully.")
  );
}

async function getUserData(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, { requiredQuery: ["uuid"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { uuid } = req.query;
  const user = await PLAYERS_DB.findDocuments("players", { minecraftUuid: uuid });

  if (user.length === 0) {
    return ResponseHandler.notFound(res, "User");
  }

  const { createdAt, machineId, deviceId, ...userData } = user[0];
  return res.status(200).json(
    createSuccessResponse(userData, "[REACHX - Auth]: User data retrieved successfully.")
  );
}

async function setupComplete(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, { requiredQuery: ["baId"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { baId } = req.query;

  const user = await DEVELOPERS_DB.findDocuments("user", {
    _id: DEVELOPERS_DB.createObjectId(baId as string),
  });

  if (user.length !== 1) {
    return ResponseHandler.badRequest(
      res, 
      "Error while modifying users. There are duplicates, similarities or not exist."
    );
  }

  if (!user[0].newaccount) {
    return res.status(200).json(
      createSuccessResponse(null, "[REACHX - Auth]: User finished.")
    );
  }

  await DEVELOPERS_DB.updateDocument(
    "user",
    { _id: DEVELOPERS_DB.createObjectId(baId as string) },
    { newaccount: false }
  );

  return res.status(200).json(
    createSuccessResponse(null, "[REACHX - Auth]: User data retrieved successfully.")
  );
}

/**
 * Get current session information
 * This endpoint retrieves the user's authentication session from Better-Auth
 * 
 * Required headers:
 * - Authorization: Bearer <session_token>
 * 
 * @route GET /api/auth/v0/get-session
 */
async function getSession(req: Request, res: Response): Promise<Response> {
  try {
    // Get session token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json(
        createGenericResponse(false, null, "No valid authorization header provided", 401)
      );
    }

    const sessionToken = authHeader.substring(7); // Remove "Bearer " prefix

    // Find session in Better-Auth sessions collection
    const sessions = await DEVELOPERS_DB.findDocuments("session", {
      token: sessionToken,
    });

    if (sessions.length === 0) {
      return res.status(401).json(
        createGenericResponse(false, null, "Session not found or expired", 401)
      );
    }

    const session = sessions[0];

    // Check if session is expired
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      return res.status(401).json(
        createGenericResponse(false, null, "Session has expired", 401)
      );
    }

    // Get user information
    const users = await DEVELOPERS_DB.findDocuments("user", {
      _id: DEVELOPERS_DB.createObjectId(session.userId),
    });

    if (users.length === 0) {
      return res.status(404).json(
        createGenericResponse(false, null, "User not found", 404)
      );
    }

    const user = users[0];

    // Return session info (sanitized)
    return res.status(200).json(
      createSuccessResponse(
        {
          session: {
            id: session._id,
            userId: session.userId,
            expiresAt: session.expiresAt,
            createdAt: session.createdAt,
          },
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified,
            newaccount: user.newaccount,
          },
        },
        "Session retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Auth", `Failed to get session: ${error}`);
    return ResponseHandler.serverError(res, error as Error);
  }
}

export { createNewUserData, getUserData, setupComplete, getSession };
