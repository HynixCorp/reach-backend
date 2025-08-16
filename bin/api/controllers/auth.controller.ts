import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { config } from "dotenv";
import { createErrorResponse, createSuccessResponse } from "../../common/utils";
import { UserPacket } from "../../interfaces/auth";
import { MongoDB } from "../../common/mongodb/mondodb";
import getMinecraftUUID from "../../common/mcResources/uuid";

config();

const REACH_SDK_DB = new MongoDB(process.env.DB_URI as string, "reach");

async function createNewUserData(req: Request, res: Response): Promise<Response<any, Record<string, any>>> {

    const isBodyValid = req.body === undefined || req.body === null || req.body === "";
    if (isBodyValid) {
        return res.status(400).json(
            createErrorResponse(
                "[REACH - Auth]: Body is empty.",
                400
            )
        );
    }
    const { username, uuid } = req.body;
    const headerMachineId = req.headers['machine-id'] as string;
    const headerDeviceId = req.headers['device-id'] as string;
    
    if (!username || headerDeviceId === undefined || headerMachineId === undefined || !uuid) {
        return res.status(400).json(
            createErrorResponse(
                "[REACH - Auth]: Username, machine ID, device ID or UUID is missing in the request body or headers.",
                400
            )
        );
    }
    
    const uuidAPI = await getMinecraftUUID(username);
    const existingUser = await REACH_SDK_DB.findDocuments("users", { uuid: uuidAPI });
    
    if (uuid !== uuidAPI) {
        return res.status(400).json(
            createErrorResponse(
                "[REACH - Auth]: UUID is invalid or not found.",
                400
            )
        );
    }

    if (existingUser.length > 0) {
        return res.status(200).json(
            createSuccessResponse(
                null,
                "[REACH - Auth]: User already exists."
            )
        );
    }

    if (!uuidAPI) {
        return res.status(404).json(
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
    }

    try {
        await REACH_SDK_DB.insertDocument("users", createPacket);
    } catch (error) {
        return res.status(500).json(
            createErrorResponse(
                `[REACH - Auth]: Failed to create user: ${error}`,
                500
            )
        );
    }
    
    return res.status(201).json(
        createSuccessResponse(
            createPacket,
            "[REACH - Auth]: User created successfully."
        )
    );
}

async function getUserData(req: Request, res: Response): Promise<Response<any, Record<string, any>>> {
    const { uuid } = req.query;
    if (!uuid) {
        return res.status(400).json(
            createErrorResponse("[REACH - Auth]: UUID is required.", 400)
        );
    }

    try {
        const user = await REACH_SDK_DB.findDocuments("users", { uuid });
        
        if (user.length === 0) {
            return res.status(404).json(
                createErrorResponse("[REACH - Auth]: User not found.", 404)
            );
        }
        
        // Return the first user found (assuming UUIDs are unique) without the createdAt, machineId, and deviceId fields
        const { createdAt, machineId, deviceId, ...userData } = user[0];
        return res.status(200).json(
            createSuccessResponse(
                userData,
                "[REACH - Auth]: User data retrieved successfully."
            )
        );
    }
    catch (error) {
        console.error("[REACH - Auth]: Error fetching user data:", error);
        return res.status(500).json(
            createErrorResponse("[REACH - Auth]: Failed to fetch user data.", 500)
        );
    }
}   

export { createNewUserData, getUserData };
