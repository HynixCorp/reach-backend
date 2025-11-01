import express from "express";

import { AUTH_ROUTER } from "../api/routers/auth.routes";
import { ATHENAS_ROUTER } from "../api/routers/athenas.routes";
import { INSTANCES_ROUTER } from "../api/routers/instances.routes";
import { PAYMENTS_ROUTER } from "../api/routers/payments.routes";
import { ORGANIZATIONS_ROUTER } from "../api/routers/organizations.routes";
import router from "../api/routers/storage.routes";
// import { LAUNCHER_ROUTER } from "../api/routers/launcher.routes";

const ROUTER = express.Router();

// Registering the authentication routes
ROUTER.use("/api/auth/v0", AUTH_ROUTER);
ROUTER.use("/api/athenas/v0", ATHENAS_ROUTER);
// Registering the storage routes
ROUTER.use("/api/cloud/v0", router);
// Registering the instances routes
ROUTER.use("/api/instances/v0", INSTANCES_ROUTER);
// Registering the payments routes
ROUTER.use("/api/payments/v0", PAYMENTS_ROUTER);
// Registering the organizations routes
ROUTER.use("/api/organizations/v0", ORGANIZATIONS_ROUTER);
// Registering the launcher routes
// ROUTER.use("/api/launcher/v0", LAUNCHER_ROUTER);

export { ROUTER as API_ROUTER };