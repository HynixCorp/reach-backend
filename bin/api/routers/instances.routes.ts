import express from "express";

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/instances.controller");

ROUTER.get("/manifest/get", CONTROLLER.getInstancesManifest);
ROUTER.get("/information/get", CONTROLLER.getInstanceInformation);
ROUTER.get("/all/get", CONTROLLER.getAllInstances);

export { ROUTER as INSTANCES_ROUTER };
export default ROUTER;