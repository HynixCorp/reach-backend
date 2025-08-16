import express from "express";

import { AUTH_ROUTER } from "../api/routers/auth.routes";
import { ATHENAS_ROUTER } from "../api/routers/athenas.routes";
import { STORAGE_ROUTER } from "../api/routers/storage.routes";
import { INSTANCES_ROUTER } from "../api/routers/instances.routes";
import { PAYMENTS_ROUTER } from "../api/routers/payments.routes";

const ROUTER = express.Router();

// Registering the authentication routes
ROUTER.use("/api/auth/v0", AUTH_ROUTER);
ROUTER.use("/api/athenas/v0", ATHENAS_ROUTER);
// Registering the storage routes
ROUTER.use("/api/cloud/v0", STORAGE_ROUTER);
// Registering the instances routes
ROUTER.use("/api/instances/v0", INSTANCES_ROUTER);
// Registering the payments routes
ROUTER.use("/api/payments/v0", PAYMENTS_ROUTER);

export { ROUTER as API_ROUTER };