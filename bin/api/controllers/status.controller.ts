import { Request, Response } from "express";
import { healthService, HealthStatus } from "../../common/services/health.service";
import { processManager } from "../../common/services/process.service";
import { logger } from "../../common/services/logger.service";
import { createSuccessResponse, createErrorResponse } from "../../common/utils";

/**
 * Status Controller for status.reachx.dev
 * 
 * Provides comprehensive health monitoring endpoints
 */

/**
 * GET /status
 * Full health report with all services, databases, and system metrics
 */
export async function getFullStatus(req: Request, res: Response): Promise<Response> {
  try {
    const report = await healthService.getFullHealthReport();
    
    const statusCode = report.status === HealthStatus.HEALTHY ? 200 :
                       report.status === HealthStatus.DEGRADED ? 200 : 503;

    return res.status(statusCode).json(report);
  } catch (error) {
    logger.error("StatusController", `Failed to get status: ${error}`);
    return res.status(500).json(createErrorResponse("Failed to retrieve health status", 500));
  }
}

/**
 * GET /status/health
 * Simple health check for load balancers
 */
export async function getSimpleHealth(req: Request, res: Response): Promise<Response> {
  const health = await healthService.simpleHealthCheck();
  return res.status(200).json(health);
}

/**
 * GET /status/ready
 * Readiness probe for Kubernetes
 */
export async function getReadiness(req: Request, res: Response): Promise<Response> {
  const readiness = await healthService.readinessCheck();
  return res.status(readiness.ready ? 200 : 503).json(readiness);
}

/**
 * GET /status/live
 * Liveness probe for Kubernetes
 */
export function getLiveness(req: Request, res: Response): Response {
  const liveness = healthService.livenessCheck();
  return res.status(200).json(liveness);
}

/**
 * GET /status/databases
 * Database-specific health information
 */
export async function getDatabasesStatus(req: Request, res: Response): Promise<Response> {
  try {
    const databases = await healthService.getDatabasesHealth();
    const allHealthy = databases.every((db) => db.status === HealthStatus.HEALTHY);
    
    return res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "healthy" : "degraded",
      databases,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("StatusController", `Failed to get database status: ${error}`);
    return res.status(500).json(createErrorResponse("Failed to check database health", 500));
  }
}

/**
 * GET /status/services
 * External services health information
 */
export async function getServicesStatus(req: Request, res: Response): Promise<Response> {
  try {
    const services = await healthService.getServicesHealth();
    const allHealthy = services.every((s) => s.status === HealthStatus.HEALTHY);
    
    return res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "healthy" : "degraded",
      services,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("StatusController", `Failed to get services status: ${error}`);
    return res.status(500).json(createErrorResponse("Failed to check services health", 500));
  }
}

/**
 * GET /status/system
 * System metrics (CPU, memory, etc.)
 */
export function getSystemStatus(req: Request, res: Response): Response {
  const metrics = healthService.getSystemMetrics();
  return res.status(200).json({
    status: "ok",
    system: metrics,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /status/process
 * Process information (uptime, restarts, etc.)
 */
export function getProcessStatus(req: Request, res: Response): Response {
  const processState = processManager.getState();
  return res.status(200).json({
    status: processState.isHealthy ? "healthy" : "unhealthy",
    process: {
      pid: process.pid,
      uptime: processManager.getUptime(),
      crashCount: processState.crashCount,
      startTime: new Date(processState.startTime).toISOString(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /status/logs
 * Recent logs (last 100 by default)
 */
export async function getRecentLogs(req: Request, res: Response): Promise<Response> {
  const count = parseInt(req.query.count as string) || 100;
  const logs = logger.getRecentLogs(count);
  
  return res.status(200).json({
    status: "ok",
    count: logs.length,
    logs,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /status/logs/:date
 * Logs from a specific date (YYYY-MM-DD)
 */
export async function getLogsByDate(req: Request, res: Response): Promise<Response> {
  const { date } = req.params;
  
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json(createErrorResponse("Invalid date format. Use YYYY-MM-DD", 400));
  }

  const logs = await logger.getLogsFromFile(date);
  
  return res.status(200).json({
    status: "ok",
    date,
    count: logs.length,
    logs,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /status/summary
 * Quick summary for dashboards
 */
export async function getStatusSummary(req: Request, res: Response): Promise<Response> {
  try {
    // Use cached report if available for faster response
    let report = healthService.getCachedHealthReport();
    
    if (!report) {
      report = await healthService.getFullHealthReport();
    }

    return res.status(200).json({
      status: report.status,
      environment: report.environment,
      version: report.version,
      uptime: report.process.uptime,
      databasesHealthy: report.databases.filter((db) => db.status === HealthStatus.HEALTHY).length,
      databasesTotal: report.databases.length,
      servicesHealthy: report.services.filter((s) => s.status === HealthStatus.HEALTHY).length,
      servicesTotal: report.services.length,
      memoryUsage: `${report.system.memoryUsage.percentage}%`,
      cpuUsage: `${report.system.cpuUsage}%`,
      timestamp: report.timestamp,
    });
  } catch (error) {
    logger.error("StatusController", `Failed to get status summary: ${error}`);
    return res.status(500).json(createErrorResponse("Failed to retrieve status summary", 500));
  }
}
