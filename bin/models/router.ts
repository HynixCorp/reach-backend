import express from "express";

// Route imports
import { AUTH_ROUTER } from "../api/routers/auth.routes";
import { ATHENAS_ROUTER } from "../api/routers/athenas.routes";
import { INSTANCES_ROUTER } from "../api/routers/instances.routes";
import { PAYMENTS_ROUTER } from "../api/routers/payments.routes";
import { ORGANIZATIONS_ROUTER } from "../api/routers/organizations.routes";
import { UPDATES_ROUTER } from "../api/routers/updates.routes";
import { OVERLAY_ROUTER } from "../api/routers/overlay.routes";
import { MARKETPLACE_ROUTER } from "../api/routers/marketplace.routes";
import { STATUS_ROUTER } from "../api/routers/status.routes";
import ADMIN_ROUTER from "../api/routers/admin.routes";
import storageRouter from "../api/routers/storage.routes";
import playerAuthRouter from "../api/routers/player-auth.routes";

// Constants
import { API_ROUTES } from "../common/constants";
import { logger } from "../common/services/logger.service";

const ROUTER = express.Router();

/**
 * API Router Configuration
 * 
 * All routes are versioned and organized by domain.
 * See bin/common/constants/api.constants.ts for route definitions.
 */

// ============================================================================
// PLAYER AUTHENTICATION (Xbox/Microsoft OAuth)
// Must be before other middleware - handles OAuth redirects
// ============================================================================
ROUTER.use(playerAuthRouter);

// ============================================================================
// STATUS & HEALTH MONITORING
// For status.reachx.dev - no authentication required
// ============================================================================
ROUTER.use(API_ROUTES.STATUS.BASE, STATUS_ROUTER);

// ============================================================================
// DEVELOPER AUTHENTICATION
// Better-Auth managed routes for developer dashboard
// ============================================================================
ROUTER.use(API_ROUTES.AUTH.BASE, AUTH_ROUTER);

// ============================================================================
// ORGANIZATIONS MANAGEMENT
// Organization CRUD, invites, and membership
// ============================================================================
ROUTER.use(API_ROUTES.ORGANIZATIONS.BASE, ORGANIZATIONS_ROUTER);

// ============================================================================
// PAYMENTS & SUBSCRIPTIONS
// Polar.sh integration for developer subscriptions
// ============================================================================
ROUTER.use(API_ROUTES.PAYMENTS.BASE, PAYMENTS_ROUTER);

// ============================================================================
// CLOUD STORAGE & VERSIONING
// Instance file management, versions, and uploads
// ============================================================================
ROUTER.use(API_ROUTES.CLOUD.BASE, storageRouter);

// ============================================================================
// INSTANCES
// Minecraft experiences/modpacks management
// ============================================================================
ROUTER.use(API_ROUTES.INSTANCES.BASE, INSTANCES_ROUTER);

// ============================================================================
// GAME OVERLAY
// Real-time overlay service for in-game features
// ============================================================================
ROUTER.use(API_ROUTES.OVERLAY.BASE, OVERLAY_ROUTER);

// ============================================================================
// MARKETPLACE
// Public marketplace for experiences
// ============================================================================
ROUTER.use(API_ROUTES.MARKETPLACE.BASE, MARKETPLACE_ROUTER);

// ============================================================================
// LAUNCHER UPDATES
// Auto-update system for Reach launcher
// ============================================================================
ROUTER.use(API_ROUTES.UPDATES.BASE, UPDATES_ROUTER);

// ============================================================================
// ATHENAS (Platform Status)
// Platform-wide status and configuration
// ============================================================================
ROUTER.use(API_ROUTES.ATHENAS.BASE, ATHENAS_ROUTER);

// ============================================================================
// ADMIN PANEL
// Developer admin panel for athenas.reachx.dev
// System metrics, process control, incident management, API versions
// ============================================================================
ROUTER.use(API_ROUTES.ADMIN.BASE, ADMIN_ROUTER);

// Log registered routes
logger.info("Router", "API routes registered successfully", {
  routes: [
    API_ROUTES.STATUS.BASE,
    API_ROUTES.AUTH.BASE,
    API_ROUTES.ORGANIZATIONS.BASE,
    API_ROUTES.PAYMENTS.BASE,
    API_ROUTES.CLOUD.BASE,
    API_ROUTES.INSTANCES.BASE,
    API_ROUTES.OVERLAY.BASE,
    API_ROUTES.MARKETPLACE.BASE,
    API_ROUTES.UPDATES.BASE,
    API_ROUTES.ATHENAS.BASE,
    API_ROUTES.ADMIN.BASE,
  ],
});

export { ROUTER as API_ROUTER };