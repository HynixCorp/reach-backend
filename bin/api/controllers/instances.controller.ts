import { Request, Response } from "express";
import { createGenericResponse, createSuccessResponse } from "../../common/utils";
import { nanoid } from "nanoid";
import { InstanceCode } from "../../types/instances";
import { getExperiencesDB, getDevelopersDB, getPlayersDB } from "../../common/services/database.service";
import { validateRequest } from "../../common/services/validation.service";
import { ResponseHandler } from "../../common/services/response.service";

// reach_experiences - Instances/experiences/modpacks
const EXPERIENCES_DB = getExperiencesDB();
// reach_players - Player inventory
const PLAYERS_DB = getPlayersDB();
// reach_developers - Developer accounts
const DEVELOPERS_DB = getDevelopersDB();

async function getInstancesManifest(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredQuery: ["id"] });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { id } = req.query;
  // Get player inventory from players DB
  const playerInventory = await PLAYERS_DB.findDocuments("inventory", { playerId: id });

  if (!playerInventory || playerInventory.length === 0) {
    return ResponseHandler.notFound(res, "Player inventory");
  }

  const gamesOwned = playerInventory[0].games?.map((g: any) => g.instanceId) || [];
  const instances = await EXPERIENCES_DB.findDocuments("instances");

  if (!instances || instances.length === 0) {
    return ResponseHandler.notFound(res, "Instances");
  }

  const resolvedInstances = instances.filter((instance: any) =>
    gamesOwned.includes(instance.id)
  );

  if (resolvedInstances.length === 0) {
    return res.status(200).json(
      createGenericResponse(true, { instances: [] }, "null", 200)
    );
  }

  return res.status(200).json(
    createSuccessResponse(resolvedInstances, "ok")
  );
}

async function getInstanceInformation(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredQuery: ["id"] });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { id } = req.query;
  const instance = await EXPERIENCES_DB.findDocuments("instances", { id });

  if (!instance || instance.length === 0) {
    return ResponseHandler.notFound(res, "Instance");
  }

  return res.status(200).json(
    createSuccessResponse(instance, "Instance information retrieved successfully.")
  );
}

async function getAllInstances(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredParams: ["orgId"] });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const instances = await EXPERIENCES_DB.findDocuments("instances", {
    organizationId: req.params.orgId,
  });

  if (!instances || instances.length === 0) {
    return res.status(200).json(
      createGenericResponse(
        true,
        { instances: [] },
        "No instances found in the database for this organization.",
        200
      )
    );
  }

  return res.status(200).json(
    createSuccessResponse(instances, "Instances retrieved successfully.")
  );
}

async function createInstanceCode(req: Request, res: Response) {
  const validation = validateRequest(req, {
    requiredBody: ["id", "ownerID"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { id, ownerID, limitedUsages } = req.body;
  const instance = await EXPERIENCES_DB.findDocuments("instances", { id });

  if (instance.length === 0) {
    return ResponseHandler.notFound(res, "Instance");
  }

  // Verify owner exists in developers DB
  const ownerExists = await DEVELOPERS_DB.findDocuments("accounts", {
    userId: ownerID,
  });

  if (ownerExists.length === 0) {
    return ResponseHandler.notFound(res, "Owner");
  }

  const codeGenerated = nanoid(10).replace(/-/g, "Q");
  const code = `${codeGenerated.slice(0, 5)}-${codeGenerated.slice(5)}`;

  const instanceCode: InstanceCode = limitedUsages
    ? {
        id: instance[0].id,
        code: codeGenerated,
        ownerID,
        createdAt: new Date(),
        updatedAt: new Date(),
        limitedUsages: true,
        limitedUsagesValue: limitedUsages,
      }
    : {
        id: instance[0].id,
        code: codeGenerated,
        ownerID,
        createdAt: new Date(),
        updatedAt: new Date(),
        limitedUsages: false,
      };

  await EXPERIENCES_DB.insertDocument("instanceCodes", instanceCode);

  return res.status(200).json(
    createSuccessResponse({ code }, "Instance code created successfully.")
  );
}

async function requestPermissionInstance(req: Request, res: Response) {
  const validation = validateRequest(req, {
    requiredBody: ["id", "permissionToken"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { id, permissionToken } = req.body;
  const instanceCode = await EXPERIENCES_DB.findDocuments("instanceCodes", {
    code: permissionToken,
  });

  if (instanceCode.length === 0) {
    return ResponseHandler.notFound(res, "Instance code");
  }

  // Check player exists
  const playerExists = await PLAYERS_DB.findDocuments("players", { minecraftUuid: id });

  if (playerExists.length === 0) {
    return ResponseHandler.notFound(res, "Player");
  }

  if (instanceCode[0].limitedUsages && instanceCode[0].limitedUsagesValue <= 0) {
    return res.status(423).json(
      createGenericResponse(
        false,
        null,
        "Instance code has no more usages. Please generate a new one or contact the administrator.",
        423
      )
    );
  }

  const instance = await EXPERIENCES_DB.findDocuments("instances", {
    id: instanceCode[0].id,
  });

  if (instance.length === 0) {
    return ResponseHandler.notFound(res, "Instance");
  }

  if (instance[0].allowedUsersIDs?.includes(id)) {
    return res.status(200).json(
      createSuccessResponse({ allowed: true }, "Instance permission granted previously.")
    );
  }

  await EXPERIENCES_DB.updateDocument(
    "instances",
    { id: instanceCode[0].id },
    { $push: { allowedUsersIDs: id } }
  );

  if (instanceCode[0].limitedUsages) {
    await EXPERIENCES_DB.updateDocument(
      "instanceCodes",
      { id: instanceCode[0].id },
      { $set: { limitedUsagesValue: instanceCode[0].limitedUsagesValue - 1 } }
    );
  }

  return res.status(200).json(
    createSuccessResponse({ allowed: true }, "Instance permission granted successfully.")
  );
}

export {
  getInstancesManifest,
  getInstanceInformation,
  getAllInstances,
  requestPermissionInstance,
  createInstanceCode,
};
