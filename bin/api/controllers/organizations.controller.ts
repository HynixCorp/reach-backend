import { Request, Response } from "express";
import { MongoDB } from "../../common/mongodb/mondodb";
import { createErrorResponse, createGenericResponse, createSuccessResponse } from "../../common/utils";
import { config } from "dotenv";
import { generateTemporaryToken } from "../../common/cryptography/temporal";

config();

const REACH_DB = new MongoDB(process.env.DB_URI as string, "reachauth");

export async function create_organization(req: Request, res: Response) {
  const {
    name,
    description,
    logo,
    supportEmail,
    supportWebsite,
    ownerId
  } = req.body;
  
  if (!name || !description || !logo || !supportEmail || !supportWebsite || !ownerId) {
    return res
      .status(400)
      .json(createErrorResponse("[REACH - Organizations]: Missing required fields. Please see the documentation for more information.", 400));
  }

  const logoBase64 = logo.toString("base64");

  const nameExistes = await REACH_DB.findDocuments("organizations", {
    name: name.toLowerCase()
  });
  
  if (nameExistes.length > 0) {
    return res
      .status(200)
      .json(createGenericResponse(false, null, "[REACH - Organizations]: Name already exists. Please use a different name or contact support.", 400));
  }

  const organizationPackage = {
    name: name.toLowerCase(),
    description,
    logo: logoBase64,
    supportEmail,
    supportWebsite,
    ownerId
  }

  await REACH_DB.insertDocument("organizations", organizationPackage);
  

  return res.status(200).json(createSuccessResponse(organizationPackage, "Organization created successfully."));
}

export async function get_organization_info(req: Request, res: Response) {}

export async function create_organization_link(req: Request, res: Response) {
    try {
        const {
            organizationId,
            ownerId
        } = req.body;
    
        if (!organizationId || !ownerId) {
            return res
              .status(400)
              .json(createErrorResponse("[REACH - Organizations]: Missing required fields. Please see the documentation for more information.", 400));
        }
    
        const organizationByOwner = await REACH_DB.findDocuments("organizations", {
            ownerId: ownerId
        });


        if (organizationByOwner.length === 0) {
            return res
              .status(400)
              .json(createErrorResponse("[REACH - Organizations]: Organizations by owner not found. Please contact support.", 400));
        }

        const organization = organizationByOwner.find((org: any) => org._id.toString() === organizationId);
    
        const temporaryToken = await generateTemporaryToken(organization._id.toString());
    
        const url = `${process.env.DASHBOARD_URL}/api/organizations/join?temporaryToken=${temporaryToken}`;
    
        await REACH_DB.insertDocument("organizationLinks", {
            organizationId,
            ownerId,
            date: new Date(),
            expirationDate: new Date(Date.now() + 1000 * 60 * 60),
            temporaryToken
        });


        return res.status(200).json(createSuccessResponse(url, "Organization link created successfully."));
    } catch (error) {
        console.log(error);
        return res.status(500).json(createErrorResponse(`[REACH - Organizations]: An error occurred while creating the organization link. ${error}`, 500));
    }
}