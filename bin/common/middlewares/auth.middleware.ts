import { Request, Response, NextFunction } from "express";
import { extractAuthToken } from "../services/validation.service";
import { ResponseHandler } from "../services/response.service";
import { generateToken } from "../reach/x-reach";
import { getDevelopersDB, getExperiencesDB } from "../services/database.service";

// reach_developers - For organizations and developer accounts
const DEVELOPERS_DB = getDevelopersDB();
// reach_experiences - For instances
const EXPERIENCES_DB = getExperiencesDB();

/**
 * Middleware to validate x-reach-token header
 * Verifies that the token matches the expected format and belongs to a valid user
 */
export async function validateXReachToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractAuthToken(req, "x-reach-token");
    
    if (!token) {
      ResponseHandler.unauthorized(res, "Missing x-reach-token header. Please provide a valid token.");
      return;
    }
    
    // Store token in request for later use
    (req as any).xReachToken = token;
    
    next();
  } catch (error) {
    ResponseHandler.serverError(res, error as Error);
  }
}

/**
 * Middleware to validate organization ownership
 * Checks if the authenticated user is the owner of the specified organization
 */
export async function validateOrganizationOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = (req as any).xReachToken;
    const { organizationId, ownerId } = req.body.organizationId 
      ? req.body 
      : req.query;
    
    if (!ownerId) {
      ResponseHandler.badRequest(res, "Owner ID is required for this operation.");
      return;
    }
    
    // Validate token against owner ID
    const expectedToken = generateToken(ownerId as string);
    
    if (token !== expectedToken) {
      ResponseHandler.forbidden(res, "Invalid X-Reach-Token. Access denied.");
      return;
    }
    
    // If organizationId is provided, verify ownership
    if (organizationId) {
      const organizations = await DEVELOPERS_DB.findDocuments("organizations", {
        _id: DEVELOPERS_DB.createObjectId(organizationId as string),
        ownerId: ownerId as string
      });
      
      if (organizations.length === 0) {
        ResponseHandler.forbidden(res, "You are not the owner of this organization.");
        return;
      }
    }
    
    // Store validated ownerId in request
    (req as any).authenticatedOwnerId = ownerId;
    
    next();
  } catch (error) {
    ResponseHandler.serverError(res, error as Error);
  }
}

/**
 * Combined middleware for routes that require both token validation and ownership
 */
export const requireOrganizationOwnership = [
  validateXReachToken,
  validateOrganizationOwner
];

/**
 * Middleware to check if user is a member of an organization
 */
export async function validateOrganizationMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { organizationId, userId } = req.body.organizationId 
      ? req.body 
      : { organizationId: req.query.organizationId, userId: req.query.userId };
    
    if (!organizationId || !userId) {
      ResponseHandler.badRequest(res, "Organization ID and User ID are required.");
      return;
    }
    
    const organizations = await DEVELOPERS_DB.findDocuments("organizations", {
      _id: DEVELOPERS_DB.createObjectId(organizationId as string),
      members: { $elemMatch: { $eq: userId } }
    });
    
    if (organizations.length === 0) {
      ResponseHandler.forbidden(res, "User is not a member of this organization.");
      return;
    }
    
    // Store organization in request
    (req as any).organization = organizations[0];
    
    next();
  } catch (error) {
    ResponseHandler.serverError(res, error as Error);
  }
}

/**
 * Middleware to validate instance access permissions
 */
export async function validateInstanceAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: userId } = req.query.id 
      ? req.query 
      : req.body;
    const { instanceId } = req.params.instanceId 
      ? req.params 
      : req.body;
    
    if (!userId || !instanceId) {
      ResponseHandler.badRequest(res, "User ID and Instance ID are required.");
      return;
    }
    
    // BUG FIX: Instances are in reach_experiences, not reach_developers!
    const instances = await EXPERIENCES_DB.findDocuments("instances", { id: instanceId });
    
    if (instances.length === 0) {
      ResponseHandler.notFound(res, "Instance");
      return;
    }
    
    const instance = instances[0];
    
    // Check if instance is public or user is in allowed list
    if (
      instance.allowedUsersIDs !== "public" &&
      !instance.allowedUsersIDs.includes(userId as string)
    ) {
      ResponseHandler.forbidden(res, "You do not have access to this instance.");
      return;
    }
    
    // Store instance in request
    (req as any).instance = instance;
    
    next();
  } catch (error) {
    ResponseHandler.serverError(res, error as Error);
  }
}
