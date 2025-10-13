import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { config } from "dotenv";
import { createErrorResponse, createSuccessResponse } from "../../common/utils";
import { UserPacket } from "../../types/auth";
import { MongoDB } from "../../common/mongodb/mongodb";
import getMinecraftUUID from "../../common/mcResources/uuid";

config();

const REACH_SDK_DB = new MongoDB(process.env.DB_URI as string, "reach");
const REACH_AUTH_DB = new MongoDB(process.env.DB_URI as string, "reachauth");

async function createNewUserData(
  req: Request,
  res: Response
): Promise<Response<any, Record<string, any>>> {
  const isBodyValid =
    req.body === undefined || req.body === null || req.body === "";
  if (isBodyValid) {
    return res
      .status(400)
      .json(createErrorResponse("[REACH - Auth]: Body is empty.", 400));
  }
  const { username, uuid } = req.body;
  const headerMachineId = req.headers["machine-id"] as string;
  const headerDeviceId = req.headers["device-id"] as string;

  if (
    !username ||
    headerDeviceId === undefined ||
    headerMachineId === undefined ||
    !uuid
  ) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Auth]: Username, machine ID, device ID or UUID is missing in the request body or headers.",
          400
        )
      );
  }

  const uuidAPI = await getMinecraftUUID(username);
  const existingUser = await REACH_SDK_DB.findDocuments("users", {
    uuid: uuidAPI,
  });

  if (uuid !== uuidAPI) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Auth]: UUID is invalid or not found.",
          400
        )
      );
  }

  if (existingUser.length > 0) {
    return res
      .status(200)
      .json(
        createSuccessResponse(null, "[REACH - Auth]: User already exists.")
      );
  }

  if (!uuidAPI) {
    return res
      .status(404)
      .json(
        createErrorResponse(
          `[REACH - Auth]: User with username ${username} not found.`,
          404
        )
      );
  }
  const createPacket: UserPacket = {
    id: uuidv4(),
    username: username,
    banned: "none",
    uuid: uuidAPI,
    createdAt: new Date(),
    machineId: headerMachineId,
    deviceId: headerDeviceId,
  };

  try {
    await REACH_SDK_DB.insertDocument("users", createPacket);
  } catch (error) {
    return res
      .status(500)
      .json(
        createErrorResponse(
          `[REACH - Auth]: Failed to create user: ${error}`,
          500
        )
      );
  }

  return res
    .status(201)
    .json(
      createSuccessResponse(
        createPacket,
        "[REACH - Auth]: User created successfully."
      )
    );
}

async function getUserData(
  req: Request,
  res: Response
): Promise<Response<any, Record<string, any>>> {
  const { uuid } = req.query;
  if (!uuid) {
    return res
      .status(400)
      .json(createErrorResponse("[REACH - Auth]: UUID is required.", 400));
  }

  try {
    const user = await REACH_SDK_DB.findDocuments("users", { uuid });

    if (user.length === 0) {
      return res
        .status(404)
        .json(createErrorResponse("[REACH - Auth]: User not found.", 404));
    }

    const { createdAt, machineId, deviceId, ...userData } = user[0];
    return res
      .status(200)
      .json(
        createSuccessResponse(
          userData,
          "[REACH - Auth]: User data retrieved successfully."
        )
      );
  } catch (error) {
    console.error("[REACH - Auth]: Error fetching user data:", error);
    return res
      .status(500)
      .json(
        createErrorResponse("[REACH - Auth]: Failed to fetch user data.", 500)
      );
  }
}

async function setupComplete(
  req: Request,
  res: Response
): Promise<Response<any, Record<string, any>>> {
  const { baId } = req.query;

  if (!baId) {
    return res
      .status(400)
      .json(createErrorResponse("[REACH - Auth]: baID is required.", 400));
  }

  try {
    const user = await REACH_AUTH_DB.findDocuments("user", {
      _id: REACH_AUTH_DB.createObjectId(baId as string),
    });

    if (user.length !== 1) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "[REACH - Auth]: Error while modifying users. There are duplicates, similarities or not exist.",
            400
          )
        );
    }

    if(!user[0].newaccount){
      return res
      .status(200)
      .json(
        createSuccessResponse(
          null,
          "[REACH - Auth]: User finished."
        )
      );
    }

    await REACH_AUTH_DB.updateDocument(
      "user",
      {
        _id: REACH_AUTH_DB.createObjectId(baId as string),
      },
      {
        newaccount: false,
      }
    );

    return res
      .status(200)
      .json(
        createSuccessResponse(
          null,
          "[REACH - Auth]: User data retrieved successfully."
        )
      );
  } catch (error) {
    console.error("[REACH - Auth]: Error modifying user data:", error);
    return res
      .status(500)
      .json(
        createErrorResponse("[REACH - Auth]: Failed to modify user data.", 500)
      );
  }
}

export { createNewUserData, getUserData, setupComplete };
