/**
 * Admin Controller
 * 
 * Developer admin panel endpoints for athenas.reachx.dev
 * Provides system metrics, process control, incident management,
 * and API version information
 */

import { Request, Response } from "express";
import { createSuccessResponse, createErrorResponse } from "../../common/utils";
import { ResponseHandler, asyncHandler } from "../../common/services/response.service";
import { validateRequest } from "../../common/services/validation.service";
import { logger } from "../../common/services/logger.service";
import { processManager } from "../../common/services/process.service";
import { healthService } from "../../common/services/health.service";
import { 
  getSystemMetrics, 
  getProcessMetrics, 
  getTrafficMetrics, 
  getAllMetrics 
} from "../../common/services/metrics.service";
import { incidentsService } from "../../common/services/incidents.service";
import { apiVersionService } from "../../common/services/apiversion.service";
import { chaosService, ServiceName, FailureMode } from "../../common/services/chaos.service";
import { 
  getDevelopersDB, 
  getPlayersDB, 
  getExperiencesDB, 
  getOverlayDB 
} from "../../common/services/database.service";

// ============ Metrics Endpoints ============

/**
 * GET /admin/metrics
 * Get all system metrics
 */
async function getAllMetricsController(req: Request, res: Response): Promise<Response> {
  try {
    const metrics = getAllMetrics();
    return res.status(200).json(createSuccessResponse(metrics, "Metrics retrieved successfully"));
  } catch (error) {
    logger.error("Admin", `Failed to get metrics: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve metrics");
  }
}

/**
 * GET /admin/metrics/system
 * Get system-level metrics (CPU, RAM, disk, network)
 */
async function getSystemMetricsController(req: Request, res: Response): Promise<Response> {
  try {
    const metrics = getSystemMetrics();
    return res.status(200).json(createSuccessResponse(metrics, "System metrics retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get system metrics: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve system metrics");
  }
}

/**
 * GET /admin/metrics/process
 * Get Node.js process metrics
 */
async function getProcessMetricsController(req: Request, res: Response): Promise<Response> {
  try {
    const metrics = getProcessMetrics();
    return res.status(200).json(createSuccessResponse(metrics, "Process metrics retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get process metrics: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve process metrics");
  }
}

/**
 * GET /admin/metrics/traffic
 * Get traffic/request metrics
 */
async function getTrafficMetricsController(req: Request, res: Response): Promise<Response> {
  try {
    const metrics = getTrafficMetrics();
    return res.status(200).json(createSuccessResponse(metrics, "Traffic metrics retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get traffic metrics: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve traffic metrics");
  }
}

/**
 * GET /admin/metrics/database
 * Get database statistics
 */
async function getDatabaseMetricsController(req: Request, res: Response): Promise<Response> {
  try {
    // Get collection counts from each database
    const developersDB = getDevelopersDB();
    const playersDB = getPlayersDB();
    const experiencesDB = getExperiencesDB();
    const overlayDB = getOverlayDB();

    const [
      userCount,
      orgCount,
      playerCount,
      instanceCount,
      presenceCount,
    ] = await Promise.all([
      developersDB.findDocuments("user", {}).then((docs) => docs.length).catch(() => 0),
      developersDB.findDocuments("organizations", {}).then((docs) => docs.length).catch(() => 0),
      playersDB.findDocuments("players", {}).then((docs) => docs.length).catch(() => 0),
      experiencesDB.findDocuments("instances", {}).then((docs) => docs.length).catch(() => 0),
      overlayDB.findDocuments("presences", {}).then((docs) => docs.length).catch(() => 0),
    ]);

    const metrics = {
      databases: {
        reach_developers: {
          users: userCount,
          organizations: orgCount,
        },
        reach_players: {
          players: playerCount,
        },
        reach_experiences: {
          instances: instanceCount,
        },
        reach_overlay: {
          presences: presenceCount,
        },
      },
      totals: {
        totalDocuments: userCount + orgCount + playerCount + instanceCount + presenceCount,
      },
    };

    return res.status(200).json(createSuccessResponse(metrics, "Database metrics retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get database metrics: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve database metrics");
  }
}

// ============ Process Control Endpoints ============

/**
 * GET /admin/process/status
 * Get current process status
 */
async function getProcessStatusController(req: Request, res: Response): Promise<Response> {
  try {
    const state = processManager.getState();
    const status = {
      ...state,
      uptime: processManager.getUptime(),
      uptimeFormatted: formatUptime(processManager.getUptime()),
    };
    return res.status(200).json(createSuccessResponse(status, "Process status retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get process status: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve process status");
  }
}

/**
 * Format uptime to human readable string
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * POST /admin/process/restart
 * Trigger a graceful restart
 */
async function restartProcessController(req: Request, res: Response): Promise<Response> {
  try {
    const { reason } = req.body;
    
    logger.warn("Admin", `Process restart requested: ${reason || "No reason provided"}`);
    
    // Send response before restarting
    res.status(200).json(createSuccessResponse({
      message: "Restart initiated",
      reason: reason || "Manual restart requested",
    }, "Restart initiated - service will be back shortly"));

    // Schedule restart after response is sent
    setTimeout(() => {
      process.emit("SIGTERM");
    }, 1000);

    return res;
  } catch (error) {
    logger.error("Admin", `Failed to initiate restart: ${error}`);
    return ResponseHandler.serverError(res, "Failed to initiate restart");
  }
}

/**
 * GET /admin/process/logs
 * Get recent application logs
 */
async function getLogsController(req: Request, res: Response): Promise<Response> {
  try {
    const { level, limit = 100, offset = 0 } = req.query;
    
    // Get recent logs from logger service
    const logs = logger.getRecentLogs(
      Number(limit),
      Number(offset),
      level as string
    );

    return res.status(200).json(createSuccessResponse({
      logs,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: logs.length === Number(limit),
      },
    }, "Logs retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get logs: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve logs");
  }
}

// ============ Health Endpoints ============

/**
 * GET /admin/health
 * Get comprehensive health status
 */
async function getHealthController(req: Request, res: Response): Promise<Response> {
  try {
    const health = await healthService.getFullHealthReport();
    return res.status(200).json(createSuccessResponse(health, "Health status retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get health status: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve health status");
  }
}

/**
 * GET /admin/health/dependencies
 * Check external dependencies health
 */
async function getDependenciesHealthController(req: Request, res: Response): Promise<Response> {
  try {
    const [databases, services] = await Promise.all([
      healthService.getDatabasesHealth(),
      healthService.getServicesHealth(),
    ]);
    return res.status(200).json(createSuccessResponse({
      databases,
      services,
    }, "Dependencies health retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to check dependencies: ${error}`);
    return ResponseHandler.serverError(res, "Failed to check dependencies health");
  }
}

// ============ Incident Management Endpoints ============

/**
 * GET /admin/incidents
 * Get all incidents
 */
async function getIncidentsController(req: Request, res: Response): Promise<Response> {
  try {
    const { status, severity, type, limit = 50, offset = 0 } = req.query;
    
    const result = await incidentsService.getAllIncidents({
      status: status as any,
      severity: severity as any,
      type: type as any,
      limit: Number(limit),
      offset: Number(offset),
    });

    return res.status(200).json(createSuccessResponse({
      ...result,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: result.incidents.length === Number(limit),
      },
    }, "Incidents retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get incidents: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve incidents");
  }
}

/**
 * GET /admin/incidents/active
 * Get active incidents
 */
async function getActiveIncidentsController(req: Request, res: Response): Promise<Response> {
  try {
    const incidents = await incidentsService.getActiveIncidents();
    return res.status(200).json(createSuccessResponse(incidents, "Active incidents retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get active incidents: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve active incidents");
  }
}

/**
 * GET /admin/incidents/stats
 * Get incident statistics
 */
async function getIncidentStatsController(req: Request, res: Response): Promise<Response> {
  try {
    const stats = await incidentsService.getIncidentStats();
    return res.status(200).json(createSuccessResponse(stats, "Incident statistics retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get incident stats: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve incident statistics");
  }
}

/**
 * GET /admin/incidents/:id
 * Get incident by ID
 */
async function getIncidentByIdController(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    
    const incident = await incidentsService.getIncidentById(id);
    if (!incident) {
      return ResponseHandler.notFound(res, "Incident not found");
    }

    return res.status(200).json(createSuccessResponse(incident, "Incident retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get incident: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve incident");
  }
}

/**
 * POST /admin/incidents
 * Create a new incident
 */
async function createIncidentController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["title", "description", "severity", "type", "affectedServices"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { title, description, severity, type, affectedServices, isPublic, scheduledFor, scheduledUntil } = req.body;
    
    // Get user from auth (assuming Better-Auth session)
    const createdBy = (req as any).user?.email || "system";

    const incident = await incidentsService.createIncident({
      title,
      description,
      severity,
      type,
      affectedServices,
      createdBy,
      isPublic,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      scheduledUntil: scheduledUntil ? new Date(scheduledUntil) : undefined,
    });

    logger.info("Admin", `Incident created: ${incident.id} by ${createdBy}`);
    return res.status(201).json(createSuccessResponse(incident, "Incident created successfully"));
  } catch (error) {
    logger.error("Admin", `Failed to create incident: ${error}`);
    return ResponseHandler.serverError(res, "Failed to create incident");
  }
}

/**
 * PATCH /admin/incidents/:id
 * Update an incident
 */
async function updateIncidentController(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const { title, description, status, severity, affectedServices, isPublic } = req.body;

    const incident = await incidentsService.updateIncident(id, {
      title,
      description,
      status,
      severity,
      affectedServices,
      isPublic,
    });

    if (!incident) {
      return ResponseHandler.notFound(res, "Incident not found");
    }

    logger.info("Admin", `Incident updated: ${id}`);
    return res.status(200).json(createSuccessResponse(incident, "Incident updated successfully"));
  } catch (error) {
    logger.error("Admin", `Failed to update incident: ${error}`);
    return ResponseHandler.serverError(res, "Failed to update incident");
  }
}

/**
 * POST /admin/incidents/:id/updates
 * Add update to incident
 */
async function addIncidentUpdateController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["message", "status"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { id } = req.params;
    const { message, status } = req.body;
    
    const createdBy = (req as any).user?.email || "system";

    const incident = await incidentsService.addIncidentUpdate(id, {
      message,
      status,
      createdBy,
    });

    if (!incident) {
      return ResponseHandler.notFound(res, "Incident not found");
    }

    logger.info("Admin", `Update added to incident ${id}: ${status}`);
    return res.status(200).json(createSuccessResponse(incident, "Incident update added"));
  } catch (error) {
    logger.error("Admin", `Failed to add incident update: ${error}`);
    return ResponseHandler.serverError(res, "Failed to add incident update");
  }
}

/**
 * DELETE /admin/incidents/:id
 * Delete an incident
 */
async function deleteIncidentController(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;

    const deleted = await incidentsService.deleteIncident(id);
    if (!deleted) {
      return ResponseHandler.notFound(res, "Incident not found");
    }

    logger.info("Admin", `Incident deleted: ${id}`);
    return res.status(200).json(createSuccessResponse({ deleted: true }, "Incident deleted successfully"));
  } catch (error) {
    logger.error("Admin", `Failed to delete incident: ${error}`);
    return ResponseHandler.serverError(res, "Failed to delete incident");
  }
}

// ============ API Version Endpoints ============

/**
 * GET /admin/api-versions
 * Get all API versions
 */
async function getAPIVersionsController(req: Request, res: Response): Promise<Response> {
  try {
    const versions = apiVersionService.getAllVersions();
    const summary = apiVersionService.getAPISummary();

    return res.status(200).json(createSuccessResponse({
      versions,
      summary,
    }, "API versions retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get API versions: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve API versions");
  }
}

/**
 * GET /admin/api-versions/current
 * Get current API version
 */
async function getCurrentAPIVersionController(req: Request, res: Response): Promise<Response> {
  try {
    const current = apiVersionService.getCurrentVersion();
    if (!current) {
      return ResponseHandler.notFound(res, "No current version found");
    }

    return res.status(200).json(createSuccessResponse(current, "Current API version retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get current API version: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve current API version");
  }
}

/**
 * GET /admin/api-versions/changelog
 * Get API changelog
 */
async function getAPIChangelogController(req: Request, res: Response): Promise<Response> {
  try {
    const { version } = req.query;
    const changelog = apiVersionService.getChangelog(version as string);

    return res.status(200).json(createSuccessResponse({
      changelog,
      total: changelog.length,
    }, "API changelog retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get API changelog: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve API changelog");
  }
}

/**
 * POST /admin/api-versions/changelog
 * Add changelog entry
 */
async function addChangelogEntryController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["version", "type", "title", "description"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { version, type, title, description, affectedEndpoints } = req.body;

    const entry = apiVersionService.addChangelogEntry(version, {
      date: new Date(),
      type,
      title,
      description,
      affectedEndpoints,
    });

    if (!entry) {
      return ResponseHandler.notFound(res, "Version not found");
    }

    logger.info("Admin", `Changelog entry added: ${title}`);
    return res.status(201).json(createSuccessResponse(entry, "Changelog entry added"));
  } catch (error) {
    logger.error("Admin", `Failed to add changelog entry: ${error}`);
    return ResponseHandler.serverError(res, "Failed to add changelog entry");
  }
}

/**
 * GET /admin/api-versions/deprecations
 * Get deprecation notices
 */
async function getDeprecationsController(req: Request, res: Response): Promise<Response> {
  try {
    const { activeOnly = "true" } = req.query;
    
    const notices = await apiVersionService.getDeprecationNotices(activeOnly === "true");
    const endpoints = apiVersionService.getDeprecatedEndpoints();

    return res.status(200).json(createSuccessResponse({
      notices,
      deprecatedEndpoints: endpoints,
    }, "Deprecations retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get deprecations: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve deprecations");
  }
}

/**
 * POST /admin/api-versions/deprecations
 * Create deprecation notice
 */
async function createDeprecationController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["endpoint", "method", "version", "reason"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { endpoint, method, version, reason, replacement, sunsetDate, migrationSteps } = req.body;

    const notice = await apiVersionService.createDeprecationNotice({
      endpoint,
      method: method.toUpperCase(),
      version,
      deprecatedSince: new Date(),
      reason,
      replacement,
      sunsetDate: sunsetDate ? new Date(sunsetDate) : undefined,
      migrationSteps,
    });

    logger.warn("Admin", `Deprecation notice created: ${endpoint} (${method})`);
    return res.status(201).json(createSuccessResponse(notice, "Deprecation notice created"));
  } catch (error) {
    logger.error("Admin", `Failed to create deprecation: ${error}`);
    return ResponseHandler.serverError(res, "Failed to create deprecation notice");
  }
}

// ============ Service Status Endpoint ============

/**
 * GET /admin/service-status
 * Get overall service status based on incidents
 */
async function getServiceStatusController(req: Request, res: Response): Promise<Response> {
  try {
    const status = await incidentsService.getServiceStatus();
    return res.status(200).json(createSuccessResponse(status, "Service status retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get service status: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve service status");
  }
}

// ============ Dashboard Summary Endpoint ============

/**
 * GET /admin/dashboard
 * Get dashboard summary for admin panel
 */
async function getDashboardController(req: Request, res: Response): Promise<Response> {
  try {
    const [
      metrics,
      processState,
      activeIncidents,
      incidentStats,
      serviceStatus,
      apiSummary,
      health,
    ] = await Promise.all([
      Promise.resolve(getAllMetrics()),
      Promise.resolve(processManager.getState()),
      incidentsService.getActiveIncidents(),
      incidentsService.getIncidentStats(),
      incidentsService.getServiceStatus(),
      Promise.resolve(apiVersionService.getAPISummary()),
      healthService.getFullHealthReport(),
    ]);

    const dashboard = {
      timestamp: new Date().toISOString(),
      overview: {
        status: serviceStatus.overall,
        uptime: metrics.process.uptime,
        activeIncidents: activeIncidents.length,
        healthScore: health.status === "healthy" ? 100 : health.status === "degraded" ? 75 : 50,
      },
      system: {
        cpu: metrics.system.cpu,
        memory: metrics.system.memory,
        nodeVersion: metrics.process.version,
      },
      traffic: {
        requestsPerMinute: metrics.traffic.requestsPerMinute,
        avgResponseTime: metrics.traffic.averageResponseTime,
        totalRequests: metrics.traffic.totalRequests,
      },
      incidents: {
        active: activeIncidents,
        stats: incidentStats,
      },
      api: apiSummary,
      process: processState,
    };

    return res.status(200).json(createSuccessResponse(dashboard, "Dashboard data retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get dashboard: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve dashboard data");
  }
}

// ============ Chaos Testing Endpoints ============

/**
 * GET /admin/chaos/status
 * Get chaos testing status
 */
async function getChaosStatusController(req: Request, res: Response): Promise<Response> {
  try {
    const status = chaosService.getStatus();
    return res.status(200).json(createSuccessResponse(status, "Chaos status retrieved"));
  } catch (error) {
    logger.error("Admin", `Failed to get chaos status: ${error}`);
    return ResponseHandler.serverError(res, "Failed to retrieve chaos status");
  }
}

/**
 * POST /admin/chaos/enable
 * Enable chaos testing mode
 */
async function enableChaosController(req: Request, res: Response): Promise<Response> {
  try {
    chaosService.enable();
    logger.warn("Admin", "🔥 CHAOS MODE ENABLED by admin request");
    return res.status(200).json(createSuccessResponse({
      enabled: true,
      message: "Chaos mode enabled - you can now inject failures",
    }, "Chaos mode enabled"));
  } catch (error) {
    logger.error("Admin", `Failed to enable chaos: ${error}`);
    return ResponseHandler.serverError(res, "Failed to enable chaos mode");
  }
}

/**
 * POST /admin/chaos/disable
 * Disable chaos testing mode and clear all failures
 */
async function disableChaosController(req: Request, res: Response): Promise<Response> {
  try {
    await chaosService.disable();
    logger.info("Admin", "Chaos mode disabled by admin request");
    return res.status(200).json(createSuccessResponse({
      enabled: false,
      message: "Chaos mode disabled - all failures cleared",
    }, "Chaos mode disabled"));
  } catch (error) {
    logger.error("Admin", `Failed to disable chaos: ${error}`);
    return ResponseHandler.serverError(res, "Failed to disable chaos mode");
  }
}

/**
 * POST /admin/chaos/inject
 * Inject a failure into a service
 */
async function injectFailureController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["service", "mode"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { service, mode, description, autoResolveAfterMs, createIncident } = req.body;

    // Validate service name
    const validServices: ServiceName[] = ["api", "auth", "database", "cdn", "websocket", "payments", "launcher"];
    if (!validServices.includes(service)) {
      return ResponseHandler.badRequest(res, `Invalid service. Must be one of: ${validServices.join(", ")}`);
    }

    // Validate failure mode
    const validModes: FailureMode[] = ["outage", "degraded", "slow", "intermittent"];
    if (!validModes.includes(mode)) {
      return ResponseHandler.badRequest(res, `Invalid mode. Must be one of: ${validModes.join(", ")}`);
    }

    const failure = await chaosService.injectFailure(service, mode, {
      description,
      autoResolveAfterMs,
      createIncident: createIncident ?? true,
    });

    logger.warn("Admin", `💥 FAILURE INJECTED: ${service} -> ${mode}`);
    return res.status(200).json(createSuccessResponse(failure, `Failure injected into ${service}`));
  } catch (error) {
    logger.error("Admin", `Failed to inject failure: ${error}`);
    if (error instanceof Error && error.message.includes("not enabled")) {
      return ResponseHandler.badRequest(res, error.message);
    }
    return ResponseHandler.serverError(res, "Failed to inject failure");
  }
}

/**
 * POST /admin/chaos/resolve/:service
 * Resolve a failure for a service
 */
async function resolveFailureController(req: Request, res: Response): Promise<Response> {
  try {
    const { service } = req.params;

    const validServices: ServiceName[] = ["api", "auth", "database", "cdn", "websocket", "payments", "launcher"];
    if (!validServices.includes(service as ServiceName)) {
      return ResponseHandler.badRequest(res, `Invalid service. Must be one of: ${validServices.join(", ")}`);
    }

    const resolved = await chaosService.resolveFailure(service as ServiceName);
    if (!resolved) {
      return ResponseHandler.notFound(res, `No active failure for ${service}`);
    }

    logger.info("Admin", `✅ FAILURE RESOLVED: ${service}`);
    return res.status(200).json(createSuccessResponse({
      service,
      resolved: true,
    }, `Failure resolved for ${service}`));
  } catch (error) {
    logger.error("Admin", `Failed to resolve failure: ${error}`);
    return ResponseHandler.serverError(res, "Failed to resolve failure");
  }
}

/**
 * POST /admin/chaos/clear
 * Clear all failures and resolve all chaos incidents
 */
async function clearAllFailuresController(req: Request, res: Response): Promise<Response> {
  try {
    const result = await chaosService.clearAllFailures();
    logger.info("Admin", `All chaos failures cleared by admin request (${result.cleared} services, ${result.incidentsResolved} incidents)`);
    return res.status(200).json(createSuccessResponse({
      cleared: true,
      servicesCleared: result.cleared,
      incidentsResolved: result.incidentsResolved,
    }, `All failures cleared - ${result.incidentsResolved} incidents resolved`));
  } catch (error) {
    logger.error("Admin", `Failed to clear failures: ${error}`);
    return ResponseHandler.serverError(res, "Failed to clear failures");
  }
}

/**
 * POST /admin/chaos/scenario
 * Simulate a predefined scenario
 */
async function simulateScenarioController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["scenario"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { scenario } = req.body;

    const validScenarios = ["partial_outage", "major_outage", "degraded_performance", "database_issues"];
    if (!validScenarios.includes(scenario)) {
      return ResponseHandler.badRequest(res, `Invalid scenario. Must be one of: ${validScenarios.join(", ")}`);
    }

    const failures = await chaosService.simulateScenario(scenario);

    logger.warn("Admin", `🔥 SCENARIO ACTIVATED: ${scenario}`);
    return res.status(200).json(createSuccessResponse({
      scenario,
      failures,
      message: `Scenario ${scenario} activated with ${failures.length} failures`,
    }, `Scenario ${scenario} activated`));
  } catch (error) {
    logger.error("Admin", `Failed to simulate scenario: ${error}`);
    if (error instanceof Error && error.message.includes("not enabled")) {
      return ResponseHandler.badRequest(res, error.message);
    }
    return ResponseHandler.serverError(res, "Failed to simulate scenario");
  }
}

/**
 * POST /admin/chaos/latency
 * Set global latency for all requests
 */
async function setGlobalLatencyController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["ms"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { ms } = req.body;

    if (typeof ms !== "number" || ms < 0 || ms > 30000) {
      return ResponseHandler.badRequest(res, "Latency must be a number between 0 and 30000 ms");
    }

    chaosService.setGlobalLatency(ms);
    logger.warn("Admin", `Global latency set to ${ms}ms`);

    return res.status(200).json(createSuccessResponse({
      latencyMs: ms,
    }, `Global latency set to ${ms}ms`));
  } catch (error) {
    logger.error("Admin", `Failed to set latency: ${error}`);
    return ResponseHandler.serverError(res, "Failed to set global latency");
  }
}

/**
 * POST /admin/chaos/error-rate
 * Set error rate percentage
 */
async function setErrorRateController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["percentage"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  try {
    const { percentage } = req.body;

    if (typeof percentage !== "number" || percentage < 0 || percentage > 100) {
      return ResponseHandler.badRequest(res, "Percentage must be a number between 0 and 100");
    }

    chaosService.setErrorRate(percentage);
    logger.warn("Admin", `Error rate set to ${percentage}%`);

    return res.status(200).json(createSuccessResponse({
      errorRate: percentage,
    }, `Error rate set to ${percentage}%`));
  } catch (error) {
    logger.error("Admin", `Failed to set error rate: ${error}`);
    return ResponseHandler.serverError(res, "Failed to set error rate");
  }
}

// ============ Export Controllers ============

export const adminController = {
  // Metrics
  getAllMetrics: asyncHandler(getAllMetricsController),
  getSystemMetrics: asyncHandler(getSystemMetricsController),
  getProcessMetrics: asyncHandler(getProcessMetricsController),
  getTrafficMetrics: asyncHandler(getTrafficMetricsController),
  getDatabaseMetrics: asyncHandler(getDatabaseMetricsController),
  
  // Process Control
  getProcessStatus: asyncHandler(getProcessStatusController),
  restartProcess: asyncHandler(restartProcessController),
  getLogs: asyncHandler(getLogsController),
  
  // Health
  getHealth: asyncHandler(getHealthController),
  getDependenciesHealth: asyncHandler(getDependenciesHealthController),
  
  // Incidents
  getIncidents: asyncHandler(getIncidentsController),
  getActiveIncidents: asyncHandler(getActiveIncidentsController),
  getIncidentStats: asyncHandler(getIncidentStatsController),
  getIncidentById: asyncHandler(getIncidentByIdController),
  createIncident: asyncHandler(createIncidentController),
  updateIncident: asyncHandler(updateIncidentController),
  addIncidentUpdate: asyncHandler(addIncidentUpdateController),
  deleteIncident: asyncHandler(deleteIncidentController),
  
  // API Versions
  getAPIVersions: asyncHandler(getAPIVersionsController),
  getCurrentAPIVersion: asyncHandler(getCurrentAPIVersionController),
  getAPIChangelog: asyncHandler(getAPIChangelogController),
  addChangelogEntry: asyncHandler(addChangelogEntryController),
  getDeprecations: asyncHandler(getDeprecationsController),
  createDeprecation: asyncHandler(createDeprecationController),
  
  // Service Status
  getServiceStatus: asyncHandler(getServiceStatusController),
  
  // Dashboard
  getDashboard: asyncHandler(getDashboardController),

  // Chaos Testing
  getChaosStatus: asyncHandler(getChaosStatusController),
  enableChaos: asyncHandler(enableChaosController),
  disableChaos: asyncHandler(disableChaosController),
  injectFailure: asyncHandler(injectFailureController),
  resolveFailure: asyncHandler(resolveFailureController),
  clearAllFailures: asyncHandler(clearAllFailuresController),
  simulateScenario: asyncHandler(simulateScenarioController),
  setGlobalLatency: asyncHandler(setGlobalLatencyController),
  setErrorRate: asyncHandler(setErrorRateController),
};

export default adminController;
