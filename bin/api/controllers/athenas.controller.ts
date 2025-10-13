import { Request, Response } from "express";
import { config } from "dotenv";
import { MongoDB } from "../../common/mongodb/mongodb";
import { createErrorResponse, createGenericResponse, createSuccessResponse } from "../../common/utils";

config();

const REACH_SDK_DB = new MongoDB(process.env.DB_URI as string, "reach");

async function get_status(req: Request, res: Response): Promise<Response> {
    try {
        const athenasStatus = await REACH_SDK_DB.findDocuments("status", {});
        if (athenasStatus.length === 0) {
            return res.status(404).json(createErrorResponse("[REACH - Athenas]: No Athenas status found.", 404));
        }
        
        if(athenasStatus[0].maintenance){
            return res.status(200).json(createGenericResponse(true, null, athenasStatus[0].maintenance_message, 503));
        }

        return res.status(200).json(createGenericResponse(true, athenasStatus[0], "ok"));
    } catch (error) {
        console.error("[REACH - Athena]: Error retrieving Athena status:", error);
        return res.status(500).json(createErrorResponse("[REACH - Athenas]: An error occurred while retrieving Athena status.", 500));
    }
}

export { get_status };