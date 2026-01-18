import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import { 
  getInstancesManifest, 
  getInstanceInformation, 
  getAllInstances, 
  requestPermissionInstance, 
  createInstanceCode 
} from "../controllers/instances.controller";
import { API_ROUTES } from "../../common/constants";

const ROUTER = express.Router();

/**
 * Instances Routes
 * 
 * Manages Minecraft experiences/modpacks.
 * Used by launcher and dashboard.
 */

// Get player's owned instances manifest
ROUTER.get(API_ROUTES.INSTANCES.MANIFEST, asyncHandler(getInstancesManifest));

// Get single instance information
ROUTER.get(API_ROUTES.INSTANCES.INFORMATION, asyncHandler(getInstanceInformation));

// Get all instances for an organization (dashboard)
ROUTER.get(API_ROUTES.INSTANCES.GET_ALL, asyncHandler(getAllInstances));

// Request permission with code (launcher)
ROUTER.post(API_ROUTES.INSTANCES.REQUEST_PERMISSION, asyncHandler(requestPermissionInstance));

// Create instance access code (dashboard)
ROUTER.post(API_ROUTES.INSTANCES.CREATE_CODE, asyncHandler(createInstanceCode));

export { ROUTER as INSTANCES_ROUTER };
export default ROUTER;