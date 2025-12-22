import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { createSuccessResponse } from "../../common/utils";
import { UserPacket } from "../../types/auth";
import getMinecraftUUID from "../../common/mcResources/uuid";
import { getDevelopersDB, getPlayersDB } from "../../common/services/database.service";
import { validateRequest } from "../../common/services/validation.service";
import { ResponseHandler } from "../../common/services/response.service";

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
      createSuccessResponse(null, "[REACH - Auth]: User already exists.")
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
    createSuccessResponse(createPacket, "[REACH - Auth]: User created successfully.")
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
    createSuccessResponse(userData, "[REACH - Auth]: User data retrieved successfully.")
  );
}

async function setupComplete(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, { requiredQuery: ["baId"] });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { baId } = req.query;

  const user = await DEVELOPERS_DB.findDocuments("users", {
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
      createSuccessResponse(null, "[REACH - Auth]: User finished.")
    );
  }

  await DEVELOPERS_DB.updateDocument(
    "users",
    { _id: DEVELOPERS_DB.createObjectId(baId as string) },
    { newaccount: false }
  );

  return res.status(200).json(
    createSuccessResponse(null, "[REACH - Auth]: User data retrieved successfully.")
  );
}

export { createNewUserData, getUserData, setupComplete };
