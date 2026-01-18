/**
 * Overlay Authentication Middleware
 * Handles server-side plugin authentication via tokens
 */
import { Request, Response, NextFunction } from "express";
import { createErrorResponse } from "../utils";
import { logger } from "../services/logger.service";
// Note: This middleware uses in-memory tokens for now
// Future: could store server tokens in reach_overlay or reach_experiences database

// ============ Environment Check ============

/**
 * Check if we're in development mode
 */
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV !== "production";
};

// ============ Demo/Test Tokens ============

/**
 * Demo token for testing purposes (only works in development)
 * Use this token in your test client: x-overlay-token: demo-token-reach-overlay-2024
 */
export const DEMO_SERVER_TOKEN = "demo-token-reach-overlay-2024";

/**
 * In-memory store for valid server tokens
 * In production, these should come from database
 */
const validServerTokens: Map<string, { serverId: string; name: string; createdAt: Date }> = new Map();

// Register demo token for development
if (isDevelopment()) {
  validServerTokens.set(DEMO_SERVER_TOKEN, {
    serverId: "demo-server-001",
    name: "Demo Test Server",
    createdAt: new Date(),
  });
  logger.debug("Overlay Auth", "Development mode: Demo token registered");
  logger.debug("Overlay Auth", `Demo Token: ${DEMO_SERVER_TOKEN}`);
}

// ============ Token Management ============

/**
 * Register a new server token
 */
export function registerServerToken(token: string, serverId: string, name: string): void {
  validServerTokens.set(token, {
    serverId,
    name,
    createdAt: new Date(),
  });
  logger.info("Overlay Auth", `Registered token for server: ${name} (${serverId})`);
}

/**
 * Revoke a server token
 */
export function revokeServerToken(token: string): boolean {
  const deleted = validServerTokens.delete(token);
  if (deleted) {
    logger.info("Overlay Auth", "Revoked token");
  }
  return deleted;
}

/**
 * Validate a server token
 */
export function validateServerToken(token: string): { valid: boolean; serverId?: string; name?: string } {
  const tokenData = validServerTokens.get(token);
  if (tokenData) {
    return { valid: true, serverId: tokenData.serverId, name: tokenData.name };
  }
  return { valid: false };
}

/**
 * Get all registered tokens (for admin purposes)
 */
export function getAllServerTokens(): Array<{ serverId: string; name: string; createdAt: Date }> {
  return Array.from(validServerTokens.values());
}

// ============ Middleware ============

/**
 * Middleware to authenticate server-side plugins
 * Requires header: x-overlay-token
 * 
 * In development mode, authentication is optional but logged
 * In production mode, authentication is required
 */
export function overlayServerAuth(req: Request, res: Response, next: NextFunction): void | Response {
  const token = req.headers["x-overlay-token"] as string;
  
  // Development mode: Allow requests without token but log warning
  if (isDevelopment()) {
    if (!token) {
      logger.debug("Overlay Auth", `DEV: Request without token from ${req.ip} - ${req.method} ${req.path}`);
      // Attach a dev flag to request
      (req as any).overlayAuth = { 
        authenticated: false, 
        serverId: "dev-anonymous",
        name: "Development Anonymous",
        isDev: true 
      };
      return next();
    }
  }
  
  // No token in production = error
  if (!token) {
    logger.warn("Overlay Auth", `Rejected: Missing token - ${req.method} ${req.path}`);
    return res.status(401).json(
      createErrorResponse("Missing authentication token. Include 'x-overlay-token' header.", 401)
    );
  }
  
  // Validate the token
  const validation = validateServerToken(token);
  
  if (!validation.valid) {
    logger.warn("Overlay Auth", `Rejected: Invalid token - ${req.method} ${req.path}`);
    return res.status(403).json(
      createErrorResponse("Invalid server token.", 403)
    );
  }
  
  // Token is valid - attach server info to request
  (req as any).overlayAuth = {
    authenticated: true,
    serverId: validation.serverId,
    name: validation.name,
    isDev: isDevelopment(),
  };
  
  logger.debug("Overlay Auth", `Authenticated: ${validation.name} (${validation.serverId}) - ${req.method} ${req.path}`);
  
  next();
}

/**
 * Middleware that requires authentication (strict mode)
 * Always requires a valid token, even in development
 */
export function overlayServerAuthStrict(req: Request, res: Response, next: NextFunction): void | Response {
  const token = req.headers["x-overlay-token"] as string;
  
  if (!token) {
    return res.status(401).json(
      createErrorResponse("Missing authentication token. Include 'x-overlay-token' header.", 401)
    );
  }
  
  const validation = validateServerToken(token);
  
  if (!validation.valid) {
    return res.status(403).json(
      createErrorResponse("Invalid server token.", 403)
    );
  }
  
  (req as any).overlayAuth = {
    authenticated: true,
    serverId: validation.serverId,
    name: validation.name,
  };
  
  next();
}

/**
 * Optional authentication - never blocks, just attaches info if token present
 */
export function overlayServerAuthOptional(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers["x-overlay-token"] as string;
  
  if (token) {
    const validation = validateServerToken(token);
    if (validation.valid) {
      (req as any).overlayAuth = {
        authenticated: true,
        serverId: validation.serverId,
        name: validation.name,
      };
    }
  }
  
  if (!(req as any).overlayAuth) {
    (req as any).overlayAuth = { authenticated: false };
  }
  
  next();
}

// ============ Types ============

export interface OverlayAuthInfo {
  authenticated: boolean;
  serverId?: string;
  name?: string;
  isDev?: boolean;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      overlayAuth?: OverlayAuthInfo;
    }
  }
}
