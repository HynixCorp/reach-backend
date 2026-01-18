import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import { createNewUserData, getUserData, setupComplete, getSession } from "../controllers/auth.controller";
import { API_ROUTES } from "../../common/constants";

const ROUTER = express.Router();

/**
 * Auth Routes
 * 
 * Handles developer authentication endpoints.
 * Note: Better-Auth routes are handled separately in better-auth.config.ts
 */

// Create new user data (for launcher)
ROUTER.post(API_ROUTES.AUTH.CREATE, asyncHandler(createNewUserData));

// Get user data
ROUTER.get(API_ROUTES.AUTH.GET, asyncHandler(getUserData));

// Mark setup as complete
ROUTER.get(API_ROUTES.AUTH.SETUP_FINISH, asyncHandler(setupComplete));

// Get current session (for dashboard)
ROUTER.get(API_ROUTES.AUTH.GET_SESSION, asyncHandler(getSession));

export { ROUTER as AUTH_ROUTER };
export default ROUTER;