import express from "express";

import { AUTH_ROUTER } from "../api/routers/auth.routes";
import { ATHENAS_ROUTER } from "../api/routers/athenas.routes";
import { INSTANCES_ROUTER } from "../api/routers/instances.routes";
import { PAYMENTS_ROUTER } from "../api/routers/payments.routes";
import { ORGANIZATIONS_ROUTER } from "../api/routers/organizations.routes";
import { UPDATES_ROUTER } from "../api/routers/updates.routes";
import { OVERLAY_ROUTER } from "../api/routers/overlay.routes";
import { MARKETPLACE_ROUTER } from "../api/routers/marketplace.routes";
import router from "../api/routers/storage.routes";
import playerAuthRouter from "../api/routers/player-auth.routes";
// import { LAUNCHER_ROUTER } from "../api/routers/launcher.routes";

const ROUTER = express.Router();

// Player authentication routes (Xbox/Microsoft) - Must be before middleware
// These routes handle OAuth redirects and don't use standard middleware
ROUTER.use(playerAuthRouter);

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
// Registering the launcher updates routes
ROUTER.use("/api/updates/v0", UPDATES_ROUTER)
// Registering the overlay routes (game overlay system)
ROUTER.use("/api/overlay/v0", OVERLAY_ROUTER);
// Registering the marketplace routes
ROUTER.use("/api/marketplace/v0", MARKETPLACE_ROUTER);

export { ROUTER as API_ROUTER };