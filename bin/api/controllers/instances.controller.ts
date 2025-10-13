import { config } from "dotenv";
import { Request, Response } from "express";
import { MongoDB } from "../../common/mongodb/mongodb";
import { createErrorResponse, createGenericResponse, createSuccessResponse, getTimeWithTimezone } from "../../common/utils";
import { nanoid } from "nanoid";
import { InstanceCode } from "../../types/instances";

config();

const REACH_SDK_DB = new MongoDB(process.env.DB_URI as string, "reach");
const REACH_SDK_USERS_DB = new MongoDB(process.env.DB_URI as string, "reachauth");

async function getInstancesManifest(req: Request, res: Response){
    try {
        const { id } = req.query;

        if(!id) {
            return res.status(400).json(createErrorResponse("[REACH - Instances]: User ID is required.", 400));
        }

        const instances = await REACH_SDK_DB.findDocuments("instances");
        
        if (!instances || instances.length === 0) {
            return res.status(200).json(
                createGenericResponse(
                    true,
                    { instances: [] },
                    "[REACH - Instances]: No instances found in the database.",
                    200
                )
            );
        }

        //Find instances allowed for the user ID in allowedUsersIDs array for each instance or if in the allowedUsersIDs array is set to "public"
        const userInstances = instances.filter(instance => 
            instance.allowedUsersIDs && (instance.allowedUsersIDs.includes(id as string) || instance.allowedUsersIDs.includes("public"))
        );
        if (userInstances.length === 0) {
            return res.status(200).json(
                createGenericResponse(
                    true,
                    { instances: [] },
                    "null",
                    200
                )
            );
        }
        // Map async, then filter after resolving all
        const instancesManifestPromises = userInstances.map(async instance => {
            if (instance.waitingUntil) {
                let currentInfo: any;
                try {
                    currentInfo = await getTimeWithTimezone();

                    if( !currentInfo || !currentInfo.time || !currentInfo.timezone) {
                        throw new Error("Failed to fetch current time with timezone.");
                    }
                    
                } catch (error) {
                    console.error("[REACH - Instances]: Error fetching current time with timezone:", error);
                    return null;
                }
                return {
                    name: instance.name,
                    id: instance.id,
                    status: instance.status,
                    application: instance.application,
                    waitingUntil: instance.waitingUntil,
                    cooldown: {
                        time: currentInfo.time,
                        timezone: currentInfo.timezone,
                    }
                };
            } else {
                return {
                    id: instance.id,
                    name: instance.name,
                    status: instance.status,
                    size: instance.size,
                    packageManifest: instance.packageManifest,
                    application: instance.application,
                    options: instance.options,
                };
            }
        });
        const resolvedInstances = (await Promise.all(instancesManifestPromises)).filter(
            instance => instance && instance.status !== "inactive"
        );

        return res.status(200).json(
            createSuccessResponse(
                resolvedInstances,
                "ok"
            )
        );
        
    } catch (error) {
        console.error("[REACH - Instances]: Error fetching instances manifest:", error);
        return res.status(500).json({
            error: "[REACH - Instances]: Failed to fetch instances manifest."
        });
    }
}

async function getInstanceInformation(req: Request, res: Response) {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json(createErrorResponse("[REACH - Instances]: Instance ID is required.", 400));
        }

        const instance = await REACH_SDK_DB.findDocuments("instances", { id });

        if (!instance) {
            return res.status(404).json(createErrorResponse("[REACH - Instances]: Instance not found.", 404));
        }

        return res.status(200).json(
            createSuccessResponse(
                instance,
                "Instance information retrieved successfully."
            )
        );
    } catch (error) {
        console.error("[REACH - Instances]: Error fetching instance information:", error);
        return res.status(500).json({
            error: "[REACH - Instances]: Failed to fetch instance information."
        });
    }
}

async function getAllInstances(req: Request, res: Response) {
    try {
        const instances = await REACH_SDK_DB.findDocuments("instances");

        if (!instances || instances.length === 0) {
            return res.status(200).json(
                createGenericResponse(
                    true,
                    { instances: [] },
                    "[REACH - Instances]: No instances found in the database.",
                    200
                )
            );
        }

        return res.status(200).json(
            createSuccessResponse(
                instances,
                "Instances retrieved successfully."
            )
        );
    } catch (error) {
        console.error("[REACH - Instances]: Error fetching all instances:", error);
        return res.status(500).json({
            error: "[REACH - Instances]: Failed to fetch all instances."
        });
    }
}

async function createInstanceCode(req: Request, res: Response) {
    try {
        const { id, ownerID, limitedUsages } = req.body;

        if (!id || !ownerID ) {
            return res.status(400).json(createErrorResponse("[REACH - Instances]: 'id' and 'ownerID' are required.", 400));
        }

        const instance = await REACH_SDK_DB.findDocuments("instances", { id: id });

        if (instance.length === 0) {
            return res.status(404).json(createErrorResponse("[REACH - Instances]: Instance not found.", 404));
        }

        const ownerExists = await REACH_SDK_USERS_DB.findDocuments("account", { accountId: ownerID });

        if (ownerExists.length === 0) {
            return res.status(404).json(createErrorResponse("[REACH - Instances]: Owner not found.", 404));
        }

        const codeGenerated = nanoid(10);

        const codeWithoutDashes = codeGenerated.replace(/-/g, "Q");

        const codeParsedFirstPart = codeWithoutDashes.slice(0, 5);
        const codeParsedSecondPart = codeWithoutDashes.slice(5);

        const code = `${codeParsedFirstPart}-${codeParsedSecondPart}`;

        let instanceCode: InstanceCode;

        if(limitedUsages) {
            instanceCode = {
                id: instance[0].id,
                code: codeWithoutDashes,
                ownerID,
                createdAt: new Date(),
                updatedAt: new Date(),
                limitedUsages: true,
                limitedUsagesValue: limitedUsages,
            };
        } else {
            instanceCode = {
                id: instance[0].id,
                code: codeWithoutDashes,
                ownerID,
                createdAt: new Date(),
                updatedAt: new Date(),
                limitedUsages: false,
            };
        }

        await REACH_SDK_DB.insertDocument("instanceCodes", instanceCode);

        return res.status(200).json(createSuccessResponse(
            {
                code,
            },
            "Instance code created successfully.",
        ));
    }
    catch (error) {
        console.error("[REACH - Instances]: Error creating instance code:", error);
        return res.status(500).json({
            error: "[REACH - Instances]: Failed to create instance code."
        });
    }
}

async function requestPermissionInstance(req: Request, res: Response) {
    try {
        const { id, permissionToken } = req.body;

        if (!id || !permissionToken) {
            return res.status(400).json(createErrorResponse("[REACH - Instances]: 'id' and 'permissionToken' are required.", 400));
        }

        const instanceCode = await REACH_SDK_DB.findDocuments("instanceCodes", { code: permissionToken });

        if (instanceCode.length === 0) {
            return res.status(404).json(createErrorResponse("[REACH - Instances]: Instance code not found.", 404));
        }

        const userExists = await REACH_SDK_DB.findDocuments("users", { uuid: id });

        if (userExists.length === 0) {
            return res.status(404).json(createErrorResponse("[REACH - Instances]: User not found to add to the instance allowed users.", 404));
        }

        if(instanceCode[0].limitedUsages) {
            if(instanceCode[0].limitedUsagesValue <= 0) {
                return res.status(423).json(createErrorResponse("[REACH - Instances]: Instance code has no more usages. Please generate a new one or contact the administrator.", 400));
            }
        }
    
        const instance = await REACH_SDK_DB.findDocuments("instances", { id: instanceCode[0].id });

        if (instance.length === 0) {
            return res.status(404).json(createErrorResponse("[REACH - Instances]: Instance not found.", 404));
        }

        if (instance[0].allowedUsersIDs.includes(id)) {
            return res.status(200).json(createSuccessResponse(
                {
                    allowed: true,
                },
                "Instance permission granted previously.",
            ));
        }

        await REACH_SDK_DB.updateDocument("instances", { id: instanceCode[0].id }, { $push: { allowedUsersIDs: id } });

        if(instanceCode[0].limitedUsages) {
            const instanceCodeUpdated = await REACH_SDK_DB.findDocuments("instanceCodes", { id: instanceCode[0].id });
            instanceCodeUpdated[0].limitedUsagesValue--;
            await REACH_SDK_DB.updateDocument("instanceCodes", { id: instanceCode[0].id }, { $set: { limitedUsagesValue: instanceCodeUpdated[0].limitedUsagesValue } });
        }

        return res.status(200).json(createSuccessResponse(
            {
                allowed: true,
            },
            "Instance permission granted successfully.",
        ));
    }
    catch (error) {
        console.error("[REACH - Instances]: Error requesting permission for instance:", error);
        return res.status(500).json({
            error: "[REACH - Instances]: Failed to request permission for instance."
        });
    }
}

export { getInstancesManifest, getInstanceInformation, getAllInstances, requestPermissionInstance, createInstanceCode };
