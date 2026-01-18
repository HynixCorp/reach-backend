/**
 * Admin Routes
 * 
 * Routes for developer admin panel (athenas.reachx.dev)
 * Protected endpoints for Reach team members only
 */

import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { API_ROUTES } from "../../common/constants/api.constants";

const router = Router();
const ADMIN = API_ROUTES.ADMIN;

// ============ Dashboard ============

/**
 * @route   GET /api/v0/admin/dashboard
 * @desc    Get dashboard summary for admin panel
 * @access  Admin only
 */
router.get(ADMIN.DASHBOARD, adminController.getDashboard);

// ============ Metrics Endpoints ============

/**
 * @route   GET /api/v0/admin/metrics
 * @desc    Get all system metrics
 * @access  Admin only
 */
router.get(ADMIN.METRICS.ALL, adminController.getAllMetrics);

/**
 * @route   GET /api/v0/admin/metrics/system
 * @desc    Get system-level metrics (CPU, RAM, disk, network)
 * @access  Admin only
 */
router.get(ADMIN.METRICS.SYSTEM, adminController.getSystemMetrics);

/**
 * @route   GET /api/v0/admin/metrics/process
 * @desc    Get Node.js process metrics
 * @access  Admin only
 */
router.get(ADMIN.METRICS.PROCESS, adminController.getProcessMetrics);

/**
 * @route   GET /api/v0/admin/metrics/traffic
 * @desc    Get traffic/request metrics
 * @access  Admin only
 */
router.get(ADMIN.METRICS.TRAFFIC, adminController.getTrafficMetrics);

/**
 * @route   GET /api/v0/admin/metrics/database
 * @desc    Get database statistics
 * @access  Admin only
 */
router.get(ADMIN.METRICS.DATABASE, adminController.getDatabaseMetrics);

// ============ Process Control ============

/**
 * @route   GET /api/v0/admin/process/status
 * @desc    Get current process status
 * @access  Admin only
 */
router.get(ADMIN.PROCESS.STATUS, adminController.getProcessStatus);

/**
 * @route   POST /api/v0/admin/process/restart
 * @desc    Trigger a graceful restart
 * @access  Admin only
 */
router.post(ADMIN.PROCESS.RESTART, adminController.restartProcess);

/**
 * @route   GET /api/v0/admin/process/logs
 * @desc    Get recent application logs
 * @access  Admin only
 */
router.get(ADMIN.PROCESS.LOGS, adminController.getLogs);

// ============ Health ============

/**
 * @route   GET /api/v0/admin/health
 * @desc    Get comprehensive health status
 * @access  Admin only
 */
router.get(ADMIN.HEALTH.STATUS, adminController.getHealth);

/**
 * @route   GET /api/v0/admin/health/dependencies
 * @desc    Check external dependencies health
 * @access  Admin only
 */
router.get(ADMIN.HEALTH.DEPENDENCIES, adminController.getDependenciesHealth);

// ============ Incidents ============

/**
 * @route   GET /api/v0/admin/incidents
 * @desc    Get all incidents
 * @access  Admin only
 */
router.get(ADMIN.INCIDENTS.LIST, adminController.getIncidents);

/**
 * @route   GET /api/v0/admin/incidents/active
 * @desc    Get active incidents
 * @access  Admin only
 */
router.get(ADMIN.INCIDENTS.ACTIVE, adminController.getActiveIncidents);

/**
 * @route   GET /api/v0/admin/incidents/stats
 * @desc    Get incident statistics
 * @access  Admin only
 */
router.get(ADMIN.INCIDENTS.STATS, adminController.getIncidentStats);

/**
 * @route   GET /api/v0/admin/incidents/:id
 * @desc    Get incident by ID
 * @access  Admin only
 */
router.get(ADMIN.INCIDENTS.BY_ID, adminController.getIncidentById);

/**
 * @route   POST /api/v0/admin/incidents
 * @desc    Create a new incident
 * @access  Admin only
 */
router.post(ADMIN.INCIDENTS.CREATE, adminController.createIncident);

/**
 * @route   PATCH /api/v0/admin/incidents/:id
 * @desc    Update an incident
 * @access  Admin only
 */
router.patch(ADMIN.INCIDENTS.UPDATE, adminController.updateIncident);

/**
 * @route   POST /api/v0/admin/incidents/:id/updates
 * @desc    Add update to incident
 * @access  Admin only
 */
router.post(ADMIN.INCIDENTS.ADD_UPDATE, adminController.addIncidentUpdate);

/**
 * @route   DELETE /api/v0/admin/incidents/:id
 * @desc    Delete an incident
 * @access  Admin only
 */
router.delete(ADMIN.INCIDENTS.DELETE, adminController.deleteIncident);

// ============ API Versions ============

/**
 * @route   GET /api/v0/admin/api-versions
 * @desc    Get all API versions
 * @access  Admin only
 */
router.get(ADMIN.API_VERSIONS.LIST, adminController.getAPIVersions);

/**
 * @route   GET /api/v0/admin/api-versions/current
 * @desc    Get current API version
 * @access  Admin only
 */
router.get(ADMIN.API_VERSIONS.CURRENT, adminController.getCurrentAPIVersion);

/**
 * @route   GET /api/v0/admin/api-versions/changelog
 * @desc    Get API changelog
 * @access  Admin only
 */
router.get(ADMIN.API_VERSIONS.CHANGELOG, adminController.getAPIChangelog);

/**
 * @route   POST /api/v0/admin/api-versions/changelog
 * @desc    Add changelog entry
 * @access  Admin only
 */
router.post(ADMIN.API_VERSIONS.ADD_CHANGELOG, adminController.addChangelogEntry);

/**
 * @route   GET /api/v0/admin/api-versions/deprecations
 * @desc    Get deprecation notices
 * @access  Admin only
 */
router.get(ADMIN.API_VERSIONS.DEPRECATIONS, adminController.getDeprecations);

/**
 * @route   POST /api/v0/admin/api-versions/deprecations
 * @desc    Create deprecation notice
 * @access  Admin only
 */
router.post(ADMIN.API_VERSIONS.CREATE_DEPRECATION, adminController.createDeprecation);

// ============ Service Status ============

/**
 * @route   GET /api/v0/admin/service-status
 * @desc    Get overall service status based on incidents
 * @access  Admin only
 */
router.get(ADMIN.SERVICE_STATUS, adminController.getServiceStatus);

// ============ Chaos Testing ============

/**
 * @route   GET /api/v0/admin/chaos/status
 * @desc    Get chaos testing status
 * @access  Admin only
 */
router.get("/chaos/status", adminController.getChaosStatus);

/**
 * @route   POST /api/v0/admin/chaos/enable
 * @desc    Enable chaos testing mode
 * @access  Admin only
 */
router.post("/chaos/enable", adminController.enableChaos);

/**
 * @route   POST /api/v0/admin/chaos/disable
 * @desc    Disable chaos testing mode
 * @access  Admin only
 */
router.post("/chaos/disable", adminController.disableChaos);

/**
 * @route   POST /api/v0/admin/chaos/inject
 * @desc    Inject a failure into a service
 * @access  Admin only
 * @body    { service: string, mode: string, description?: string, autoResolveAfterMs?: number, createIncident?: boolean }
 */
router.post("/chaos/inject", adminController.injectFailure);

/**
 * @route   POST /api/v0/admin/chaos/resolve/:service
 * @desc    Resolve a failure for a specific service
 * @access  Admin only
 */
router.post("/chaos/resolve/:service", adminController.resolveFailure);

/**
 * @route   POST /api/v0/admin/chaos/clear
 * @desc    Clear all failures
 * @access  Admin only
 */
router.post("/chaos/clear", adminController.clearAllFailures);

/**
 * @route   POST /api/v0/admin/chaos/scenario
 * @desc    Simulate a predefined failure scenario
 * @access  Admin only
 * @body    { scenario: "partial_outage" | "major_outage" | "degraded_performance" | "database_issues" }
 */
router.post("/chaos/scenario", adminController.simulateScenario);

/**
 * @route   POST /api/v0/admin/chaos/latency
 * @desc    Set global latency for all requests
 * @access  Admin only
 * @body    { ms: number }
 */
router.post("/chaos/latency", adminController.setGlobalLatency);

/**
 * @route   POST /api/v0/admin/chaos/error-rate
 * @desc    Set error rate percentage
 * @access  Admin only
 * @body    { percentage: number }
 */
router.post("/chaos/error-rate", adminController.setErrorRate);

export default router;
