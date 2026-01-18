/**
 * Admin Authentication Middleware
 * 
 * Protects admin routes for athenas.reachx.dev
 * Only allows access to authorized Reach team members
 */

import { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../services/response.service";
import { logger } from "../services/logger.service";
import { getDevelopersDB } from "../services/database.service";

/**
 * List of admin email addresses
 * These are the Reach team members who can access admin endpoints
 */
const ADMIN_EMAILS: string[] = [
  // Add your admin emails here
  // "admin@reachx.dev",
  // "developer@reachx.dev",
];

/**
 * Admin API keys for service-to-service authentication
 */
const ADMIN_API_KEYS: string[] = process.env.ADMIN_API_KEYS?.split(",") || [];

/**
 * Check if user is an admin by email
 */
async function isAdminUser(email: string): Promise<boolean> {
  // Check against hardcoded list
  if (ADMIN_EMAILS.includes(email)) {
    return true;
  }

  // Check against database (for dynamic admin management)
  try {
    const db = getDevelopersDB();
    const users = await db.findDocuments("user", { email });
    if (users.length > 0 && users[0].role === "admin") {
      return true;
    }
  } catch (error) {
    logger.error("AdminAuth", `Failed to check admin status: ${error}`);
  }

  return false;
}

/**
 * Check if API key is valid admin key
 */
function isValidAdminKey(apiKey: string): boolean {
  return ADMIN_API_KEYS.includes(apiKey);
}

/**
 * Admin authentication middleware
 * 
 * Accepts:
 * - Valid Better-Auth session with admin user
 * - Valid admin API key in x-admin-key header
 */
export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    // Check for admin API key
    const adminKey = req.headers["x-admin-key"] as string;
    if (adminKey && isValidAdminKey(adminKey)) {
      logger.debug("AdminAuth", "Admin access via API key");
      return next();
    }

    // Check for authenticated user session
    const user = (req as any).user;
    if (user?.email) {
      const isAdmin = await isAdminUser(user.email);
      if (isAdmin) {
        logger.debug("AdminAuth", `Admin access granted: ${user.email}`);
        return next();
      }
    }

    // For development, allow if ADMIN_DEV_MODE is enabled
    if (process.env.ADMIN_DEV_MODE === "true" && process.env.NODE_ENV !== "production") {
      logger.warn("AdminAuth", "Admin access granted via DEV_MODE - disable in production!");
      return next();
    }

    logger.warn("AdminAuth", `Unauthorized admin access attempt from ${req.ip}`);
    return ResponseHandler.forbidden(res, "Admin access required");
  } catch (error) {
    logger.error("AdminAuth", `Auth middleware error: ${error}`);
    return ResponseHandler.serverError(res, "Authentication error");
  }
}

/**
 * Optional admin auth - allows public access but marks admin users
 */
export async function optionalAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const adminKey = req.headers["x-admin-key"] as string;
  const user = (req as any).user;

  if (adminKey && isValidAdminKey(adminKey)) {
    (req as any).isAdmin = true;
  } else if (user?.email) {
    (req as any).isAdmin = await isAdminUser(user.email);
  } else {
    (req as any).isAdmin = false;
  }

  next();
}

export default adminAuthMiddleware;
