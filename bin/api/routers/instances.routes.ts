import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import { 
  getInstancesManifest, 
  getInstanceInformation, 
  getAllInstances, 
  requestPermissionInstance, 
  createInstanceCode 
} from "../controllers/instances.controller";

const ROUTER = express.Router();

ROUTER.get("/manifest/get", asyncHandler(getInstancesManifest));
ROUTER.get("/information/get", asyncHandler(getInstanceInformation));
ROUTER.get("/:orgId/all/get", asyncHandler(getAllInstances));
ROUTER.post("/permission/request", asyncHandler(requestPermissionInstance));
ROUTER.post("/code/create", asyncHandler(createInstanceCode));

export { ROUTER as INSTANCES_ROUTER };
export default ROUTER;