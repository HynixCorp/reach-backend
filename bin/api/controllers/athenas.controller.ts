import { Request, Response } from "express";
import { config } from "dotenv";
import { createGenericResponse } from "../../common/utils";
import { getExperiencesDB } from "../../common/services/database.service";
import { ResponseHandler } from "../../common/services/response.service";

config();

// reach_experiences - Status info is part of the experiences/platform config
const EXPERIENCES_DB = getExperiencesDB();

async function get_status(req: Request, res: Response): Promise<Response> {
    try {
        const athenasStatus = await EXPERIENCES_DB.findDocuments("status", {});
        if (athenasStatus.length === 0) {
            return ResponseHandler.notFound(res, "Athenas status");
        }
        
        if(athenasStatus[0].maintenance){
            return res.status(200).json(createGenericResponse(true, null, athenasStatus[0].maintenance_message, 503));
        }

        return res.status(200).json(createGenericResponse(true, athenasStatus[0], "ok"));
    } catch (error) {
        console.error("[REACH - Athena]: Error retrieving Athena status:", error);
        return ResponseHandler.serverError(res, error as Error);
    }
}

async function health(req: Request, res: Response): Promise<Response> {
    return res.status(200).json({ status: "healthy", service: "reach-backend" });
}

async function rootInfo(req: Request, res: Response): Promise<Response> {
    return res.status(200).json({
        status: "ok",
        service: "reach-backend",
        timestamp: new Date().toISOString()
    });
}

export { get_status, health, rootInfo };