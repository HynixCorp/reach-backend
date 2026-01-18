/**
 * Chaos Testing Service
 * 
 * Allows simulating failures in services for testing status.reachx.dev
 * USE ONLY IN DEVELOPMENT/STAGING - NEVER IN PRODUCTION
 */

import { logger } from "./logger.service";
import { incidentsService } from "./incidents.service";

// ============ Types ============

export type ServiceName = "api" | "auth" | "database" | "cdn" | "websocket" | "payments" | "launcher";
export type FailureMode = "outage" | "degraded" | "slow" | "intermittent";

export interface ServiceFailure {
  service: ServiceName;
  mode: FailureMode;
  startedAt: Date;
  description: string;
  autoResolveAfterMs?: number;
  incidentId?: string;
}

export interface ChaosConfig {
  enabled: boolean;
  failures: Map<ServiceName, ServiceFailure>;
  globalLatencyMs: number;
  errorRate: number; // 0-100 percentage
}

// ============ Service ============

class ChaosService {
  private static instance: ChaosService;
  private config: ChaosConfig;
  private autoResolveTimers: Map<ServiceName, NodeJS.Timeout> = new Map();

  private constructor() {
    this.config = {
      enabled: process.env.CHAOS_MODE_ENABLED === "true" || process.env.NODE_ENV === "development",
      failures: new Map(),
      globalLatencyMs: 0,
      errorRate: 0,
    };

    logger.info("ChaosService", `Chaos testing service initialized (enabled: ${this.config.enabled})`);
  }

  static getInstance(): ChaosService {
    if (!ChaosService.instance) {
      ChaosService.instance = new ChaosService();
    }
    return ChaosService.instance;
  }

  /**
   * Check if chaos mode is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable chaos mode
   */
  enable(): void {
    this.config.enabled = true;
    logger.warn("ChaosService", "🔥 CHAOS MODE ENABLED - Services may fail!");
  }

  /**
   * Disable chaos mode and clear all failures
   */
  async disable(): Promise<void> {
    this.config.enabled = false;
    await this.clearAllFailures();
    logger.info("ChaosService", "Chaos mode disabled - All services restored");
  }

  /**
   * Inject a failure into a service
   */
  async injectFailure(
    service: ServiceName,
    mode: FailureMode,
    options?: {
      description?: string;
      autoResolveAfterMs?: number;
      createIncident?: boolean;
    }
  ): Promise<ServiceFailure> {
    if (!this.config.enabled) {
      throw new Error("Chaos mode is not enabled. Enable it first with /api/admin/v0/chaos/enable");
    }

    const description = options?.description || this.generateFailureDescription(service, mode);

    const failure: ServiceFailure = {
      service,
      mode,
      startedAt: new Date(),
      description,
      autoResolveAfterMs: options?.autoResolveAfterMs,
    };

    // Create incident if requested
    if (options?.createIncident) {
      const incident = await incidentsService.createIncident({
        title: `[CHAOS TEST] ${this.getFailureTitleByMode(mode)} - ${service.toUpperCase()}`,
        description: `⚠️ CHAOS TEST: ${description}`,
        severity: mode === "outage" ? "critical" : mode === "degraded" ? "major" : "minor",
        type: mode === "outage" ? "outage" : "degraded",
        affectedServices: [service],
        createdBy: "chaos-service",
        isPublic: true,
      });
      failure.incidentId = incident.id;
    }

    this.config.failures.set(service, failure);
    logger.warn("ChaosService", `💥 INJECTED FAILURE: ${service} is now ${mode}`);

    // Set auto-resolve timer if specified
    if (options?.autoResolveAfterMs) {
      const existingTimer = this.autoResolveTimers.get(service);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        this.resolveFailure(service);
      }, options.autoResolveAfterMs);

      this.autoResolveTimers.set(service, timer);
    }

    return failure;
  }

  /**
   * Resolve a failure
   */
  async resolveFailure(service: ServiceName): Promise<boolean> {
    const failure = this.config.failures.get(service);
    if (!failure) return false;

    // Resolve the incident if one was created
    if (failure.incidentId) {
      await incidentsService.addIncidentUpdate(failure.incidentId, {
        message: "Chaos test completed - Service restored",
        status: "resolved",
        createdBy: "chaos-service",
      });
    }

    this.config.failures.delete(service);

    // Clear auto-resolve timer
    const timer = this.autoResolveTimers.get(service);
    if (timer) {
      clearTimeout(timer);
      this.autoResolveTimers.delete(service);
    }

    logger.info("ChaosService", `✅ RESOLVED FAILURE: ${service} is now operational`);
    return true;
  }

  /**
   * Clear all failures and ensure all chaos incidents are resolved
   */
  async clearAllFailures(): Promise<{ cleared: number; incidentsResolved: number }> {
    const services = Array.from(this.config.failures.keys());
    let incidentsResolved = 0;
    
    // First, resolve all tracked failures
    for (const service of services) {
      const failure = this.config.failures.get(service);
      if (failure?.incidentId) {
        try {
          await incidentsService.addIncidentUpdate(failure.incidentId, {
            message: "Chaos test completed - Service restored",
            status: "resolved",
            createdBy: "chaos-service",
          });
          incidentsResolved++;
        } catch (error) {
          logger.error("ChaosService", `Failed to resolve incident ${failure.incidentId}: ${error}`);
        }
      }
      this.config.failures.delete(service);
      
      // Clear auto-resolve timer
      const timer = this.autoResolveTimers.get(service);
      if (timer) {
        clearTimeout(timer);
        this.autoResolveTimers.delete(service);
      }
    }

    // Also clean up any orphaned chaos test incidents from the database
    try {
      const activeIncidents = await incidentsService.getActiveIncidents();
      for (const incident of activeIncidents) {
        if (incident.title.includes("[CHAOS TEST]") || incident.createdBy === "chaos-service") {
          await incidentsService.addIncidentUpdate(incident.id, {
            message: "Chaos test cleanup - Automatically resolved",
            status: "resolved",
            createdBy: "chaos-service",
          });
          incidentsResolved++;
          logger.info("ChaosService", `Cleaned up orphaned chaos incident: ${incident.id}`);
        }
      }
    } catch (error) {
      logger.error("ChaosService", `Failed to clean orphaned incidents: ${error}`);
    }

    this.config.globalLatencyMs = 0;
    this.config.errorRate = 0;

    logger.info("ChaosService", `All failures cleared (${services.length} services, ${incidentsResolved} incidents resolved)`);
    
    return { cleared: services.length, incidentsResolved };
  }

  /**
   * Get current failure for a service
   */
  getFailure(service: ServiceName): ServiceFailure | undefined {
    return this.config.failures.get(service);
  }

  /**
   * Check if a service is failing
   */
  isServiceFailing(service: ServiceName): boolean {
    return this.config.enabled && this.config.failures.has(service);
  }

  /**
   * Get service status (for integration with health checks)
   */
  getServiceStatus(service: ServiceName): "operational" | "degraded" | "outage" {
    if (!this.config.enabled) return "operational";

    const failure = this.config.failures.get(service);
    if (!failure) return "operational";

    switch (failure.mode) {
      case "outage":
        return "outage";
      case "degraded":
      case "slow":
      case "intermittent":
        return "degraded";
      default:
        return "operational";
    }
  }

  /**
   * Get all active failures
   */
  getActiveFailures(): ServiceFailure[] {
    return Array.from(this.config.failures.values());
  }

  /**
   * Set global latency for all requests
   */
  setGlobalLatency(ms: number): void {
    this.config.globalLatencyMs = ms;
    logger.warn("ChaosService", `Global latency set to ${ms}ms`);
  }

  /**
   * Set error rate (percentage of requests that should fail)
   */
  setErrorRate(percentage: number): void {
    this.config.errorRate = Math.min(100, Math.max(0, percentage));
    logger.warn("ChaosService", `Error rate set to ${this.config.errorRate}%`);
  }

  /**
   * Apply chaos effects (call this in middleware)
   */
  async applyChaos(): Promise<{ shouldFail: boolean; latency: number }> {
    if (!this.config.enabled) {
      return { shouldFail: false, latency: 0 };
    }

    // Check error rate
    const shouldFail = Math.random() * 100 < this.config.errorRate;

    // Apply latency
    if (this.config.globalLatencyMs > 0) {
      await this.sleep(this.config.globalLatencyMs);
    }

    return { shouldFail, latency: this.config.globalLatencyMs };
  }

  /**
   * Get current chaos config status
   */
  getStatus(): {
    enabled: boolean;
    activeFailures: ServiceFailure[];
    globalLatencyMs: number;
    errorRate: number;
    affectedServices: ServiceName[];
  } {
    return {
      enabled: this.config.enabled,
      activeFailures: this.getActiveFailures(),
      globalLatencyMs: this.config.globalLatencyMs,
      errorRate: this.config.errorRate,
      affectedServices: Array.from(this.config.failures.keys()),
    };
  }

  /**
   * Simulate a full scenario
   */
  async simulateScenario(scenario: "partial_outage" | "major_outage" | "degraded_performance" | "database_issues"): Promise<ServiceFailure[]> {
    if (!this.config.enabled) {
      throw new Error("Chaos mode is not enabled");
    }

    const failures: ServiceFailure[] = [];

    switch (scenario) {
      case "partial_outage":
        // Websocket and payments down
        failures.push(await this.injectFailure("websocket", "outage", {
          description: "WebSocket servers unreachable",
          createIncident: true,
          autoResolveAfterMs: 5 * 60 * 1000, // 5 minutes
        }));
        failures.push(await this.injectFailure("payments", "outage", {
          description: "Payment processing unavailable",
          createIncident: true,
          autoResolveAfterMs: 5 * 60 * 1000,
        }));
        break;

      case "major_outage":
        // Multiple critical services down
        failures.push(await this.injectFailure("api", "outage", {
          description: "API servers experiencing critical failure",
          createIncident: true,
          autoResolveAfterMs: 10 * 60 * 1000,
        }));
        failures.push(await this.injectFailure("database", "outage", {
          description: "Database cluster unreachable",
          createIncident: true,
          autoResolveAfterMs: 10 * 60 * 1000,
        }));
        failures.push(await this.injectFailure("auth", "outage", {
          description: "Authentication services down",
          createIncident: true,
          autoResolveAfterMs: 10 * 60 * 1000,
        }));
        break;

      case "degraded_performance":
        // Slow responses across services
        this.setGlobalLatency(2000); // 2 second delay
        failures.push(await this.injectFailure("api", "slow", {
          description: "API experiencing high latency",
          createIncident: true,
          autoResolveAfterMs: 3 * 60 * 1000,
        }));
        failures.push(await this.injectFailure("cdn", "degraded", {
          description: "CDN serving content slowly",
          createIncident: true,
          autoResolveAfterMs: 3 * 60 * 1000,
        }));
        break;

      case "database_issues":
        // Database problems
        failures.push(await this.injectFailure("database", "degraded", {
          description: "Database connection pool exhausted",
          createIncident: true,
          autoResolveAfterMs: 5 * 60 * 1000,
        }));
        this.setErrorRate(20); // 20% of requests fail
        break;
    }

    logger.warn("ChaosService", `🔥 SCENARIO ACTIVATED: ${scenario} (${failures.length} failures)`);
    return failures;
  }

  // ============ Helper Methods ============

  private generateFailureDescription(service: ServiceName, mode: FailureMode): string {
    const descriptions: Record<FailureMode, Record<ServiceName, string>> = {
      outage: {
        api: "API servers are completely unreachable",
        auth: "Authentication service is down",
        database: "Database cluster has failed",
        cdn: "CDN is not serving content",
        websocket: "WebSocket connections are failing",
        payments: "Payment processing is unavailable",
        launcher: "Launcher update service is down",
      },
      degraded: {
        api: "API is responding slowly",
        auth: "Authentication is taking longer than usual",
        database: "Database queries are slow",
        cdn: "CDN is serving content with delays",
        websocket: "WebSocket connections are unstable",
        payments: "Payment processing is delayed",
        launcher: "Launcher updates are slow",
      },
      slow: {
        api: "API response times are elevated",
        auth: "Authentication requests are slow",
        database: "Database is experiencing high load",
        cdn: "CDN is throttling requests",
        websocket: "WebSocket message delivery is delayed",
        payments: "Payment verification is slow",
        launcher: "Download speeds are reduced",
      },
      intermittent: {
        api: "API is returning sporadic errors",
        auth: "Some login attempts are failing",
        database: "Database connections are dropping",
        cdn: "Some CDN requests are failing",
        websocket: "WebSocket connections are dropping randomly",
        payments: "Some payment attempts are failing",
        launcher: "Some downloads are failing",
      },
    };

    return descriptions[mode][service];
  }

  private getFailureTitleByMode(mode: FailureMode): string {
    const titles: Record<FailureMode, string> = {
      outage: "Service Outage",
      degraded: "Degraded Performance",
      slow: "High Latency",
      intermittent: "Intermittent Issues",
    };
    return titles[mode];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton
export const chaosService = ChaosService.getInstance();
export default chaosService;
