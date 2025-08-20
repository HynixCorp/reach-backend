import { config } from "dotenv";
import { Request, Response } from "express";
import { MongoDB } from "../../common/mongodb/mondodb";
import { createErrorResponse, createGenericResponse, createSuccessResponse, getTimeWithTimezone } from "../../common/utils";

config();

const REACH_SDK_DB = new MongoDB(process.env.DB_URI as string, "reach");

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

export { getInstancesManifest, getInstanceInformation, getAllInstances };
