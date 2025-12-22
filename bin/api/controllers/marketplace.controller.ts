import { Request, Response } from "express";
import { createSuccessResponse } from "../../common/utils";
import { getExperiencesDB } from "../../common/services/database.service";

// reach_experiences - Marketplace items are instances
const EXPERIENCES_DB = getExperiencesDB();
const STATUS_ACTIVE = "activepublic";

export async function getMarketplaceMain(req: Request, res: Response){
    // TODO: Implement marketplace main retrieval logic
}

export async function getAllMarketplaceItems(req: Request, res: Response){
    // Fetch active marketplace items with pagination
    const requestDB = await EXPERIENCES_DB.findDocuments("instances", {
        status: STATUS_ACTIVE
    })

    // Clear sensitive fields
    const SENSITIVE_FIELDS = ["subscriptionOwnerId", "activeVersionHash", "activeVersionNumber", "totalVersions", "experiencePackage"];

    // Remove sensitive fields from each item
    requestDB.forEach((item: any) => {
        SENSITIVE_FIELDS.forEach((field) => {
            delete item[field];
        });
    });

    // Return the sanitized list
    return res.status(200).json(
        createSuccessResponse(requestDB, "ok")
    );
}