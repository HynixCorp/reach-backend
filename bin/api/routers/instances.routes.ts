import express from "express";

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/instances.controller");

ROUTER.get("/manifest/get", CONTROLLER.getInstancesManifest);
ROUTER.get("/information/get", CONTROLLER.getInstanceInformation);
ROUTER.get("/:orgId/all/get", CONTROLLER.getAllInstances);
ROUTER.post("/permission/request", CONTROLLER.requestPermissionInstance);
ROUTER.post("/code/create", CONTROLLER.createInstanceCode);

export { ROUTER as INSTANCES_ROUTER };
export default ROUTER;