import "colorts/lib/string";
import os from "os";
import { getDatabaseService } from "./database.service";
import { processManager } from "./process.service";
import { logger } from "./logger.service";
import { chaosService } from "./chaos.service";

/**
 * Health check status
 */
export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
}

/**
 * Service health info
 */
export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTime?: number;
  message?: string;
  lastCheck: string;
}

/**
 * Database health info
 */
export interface DatabaseHealth {
  name: string;
  status: HealthStatus;
  responseTime?: number;
  collections?: number;
  message?: string;
}

/**
 * System metrics
 */
export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  uptime: number;
  processUptime: number;
  nodeVersion: string;
  platform: string;
  arch: string;
  loadAverage: number[];
}

/**
 * Full health report
 */
export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  version: string;
  environment: string;
  services: ServiceHealth[];
  databases: DatabaseHealth[];
  system: SystemMetrics;
  process: {
    pid: number;
    crashCount: number;
    isHealthy: boolean;
    uptime: number;
    environment: string;
  };
}

/**
 * Health Check Service
 * 
 * Provides comprehensive health monitoring for status.reachx.dev
 */
class HealthService {
  private static instance: HealthService;
  private lastHealthCheck: HealthReport | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  /**
   * Start periodic health checks
   */
  public startPeriodicHealthChecks(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        this.lastHealthCheck = await this.getFullHealthReport();
      } catch (error) {
        logger.error("HealthService", `Health check failed: ${error}`);
      }
    }, intervalMs);

    // Run initial check
    this.getFullHealthReport().then((report) => {
      this.lastHealthCheck = report;
    });
  }

  /**
   * Stop periodic health checks
   */
  public stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get cached health report (for quick responses)
   */
  public getCachedHealthReport(): HealthReport | null {
    return this.lastHealthCheck;
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(dbName: string, db: any): Promise<DatabaseHealth> {
    const startTime = Date.now();
    
    try {
      // Ping the database
      await db.ping();
      const responseTime = Date.now() - startTime;

      return {
        name: dbName,
        status: responseTime < 1000 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        responseTime,
        message: "Connected",
      };
    } catch (error) {
      return {
        name: dbName,
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  /**
   * Get all database health statuses
   */
  public async getDatabasesHealth(): Promise<DatabaseHealth[]> {
    const dbService = getDatabaseService();
    const databases: DatabaseHealth[] = [];

    // Check each database
    const dbChecks = [
      { name: "reach_developers", db: dbService.getDevelopersDB() },
      { name: "reach_players", db: dbService.getPlayersDB() },
      { name: "reach_experiences", db: dbService.getExperiencesDB() },
      { name: "reach_overlay", db: dbService.getOverlayDB() },
    ];

    for (const { name, db } of dbChecks) {
      databases.push(await this.checkDatabaseHealth(name, db));
    }

    return databases;
  }

  /**
   * Get system metrics
   */
  public getSystemMetrics(): SystemMetrics {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Get CPU usage (approximate)
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    const cpuUsage = ((1 - totalIdle / totalTick) * 100);

    return {
      cpuUsage: Math.round(cpuUsage * 100) / 100,
      memoryUsage: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: Math.round((usedMem / totalMem) * 10000) / 100,
      },
      uptime: os.uptime(),
      processUptime: process.uptime(),
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      loadAverage: os.loadavg(),
    };
  }

  /**
   * Get external services health (expandable)
   */
  public async getServicesHealth(): Promise<ServiceHealth[]> {
    const services: ServiceHealth[] = [];
    const now = new Date().toISOString();

    // Define all services to check
    const serviceList: Array<{ name: string; chaosName?: string }> = [
      { name: "api", chaosName: "api" },
      { name: "auth", chaosName: "auth" },
      { name: "socket.io", chaosName: "websocket" },
      { name: "cdn", chaosName: "cdn" },
      { name: "payments", chaosName: "payments" },
      { name: "launcher", chaosName: "launcher" },
    ];

    for (const svc of serviceList) {
      // Check if chaos service has injected a failure
      if (svc.chaosName && chaosService.isEnabled()) {
        const chaosStatus = chaosService.getServiceStatus(svc.chaosName as any);
        if (chaosStatus !== "operational") {
          const failure = chaosService.getFailure(svc.chaosName as any);
          services.push({
            name: svc.name,
            status: chaosStatus === "outage" ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED,
            message: failure?.description || `Service is ${chaosStatus}`,
            lastCheck: now,
          });
          continue;
        }
      }

      // Default healthy status
      services.push({
        name: svc.name,
        status: HealthStatus.HEALTHY,
        lastCheck: now,
      });
    }

    return services;
  }

  /**
   * Get full health report
   */
  public async getFullHealthReport(): Promise<HealthReport> {
    const [databases, services, system] = await Promise.all([
      this.getDatabasesHealth(),
      this.getServicesHealth(),
      Promise.resolve(this.getSystemMetrics()),
    ]);

    const processState = processManager.getState();

    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;

    const unhealthyDbs = databases.filter((db) => db.status === HealthStatus.UNHEALTHY);
    const degradedDbs = databases.filter((db) => db.status === HealthStatus.DEGRADED);
    const unhealthyServices = services.filter((s) => s.status === HealthStatus.UNHEALTHY);

    if (unhealthyDbs.length > 0 || unhealthyServices.length > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
      processManager.markUnhealthy();
    } else if (degradedDbs.length > 0 || system.memoryUsage.percentage > 90) {
      overallStatus = HealthStatus.DEGRADED;
    } else {
      processManager.markHealthy();
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      services,
      databases,
      system,
      process: {
        pid: process.pid,
        crashCount: processState.crashCount,
        isHealthy: processState.isHealthy,
        uptime: processManager.getUptime(),
        environment: processManager.getEnvironment(),
      },
    };
  }

  /**
   * Simple health check (for load balancer)
   */
  public async simpleHealthCheck(): Promise<{ status: string; service: string }> {
    return {
      status: "healthy",
      service: "reach-backend",
    };
  }

  /**
   * Readiness check (for Kubernetes)
   */
  public async readinessCheck(): Promise<{ ready: boolean; message: string }> {
    try {
      const dbHealth = await this.getDatabasesHealth();
      const allHealthy = dbHealth.every((db) => db.status !== HealthStatus.UNHEALTHY);

      return {
        ready: allHealthy,
        message: allHealthy ? "Service is ready" : "Some databases are unhealthy",
      };
    } catch (error) {
      return {
        ready: false,
        message: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }

  /**
   * Liveness check (for Kubernetes)
   */
  public livenessCheck(): { alive: boolean; uptime: number } {
    return {
      alive: true,
      uptime: processManager.getUptime(),
    };
  }
}

export const healthService = HealthService.getInstance();
export default healthService;
