/**
 * Incidents Service
 * 
 * Manages incidents for status.reachx.dev
 * Allows creating, updating, and tracking service incidents
 */

import { ObjectId } from "mongodb";
import { getExperiencesDB } from "./database.service";
import { logger } from "./logger.service";

// Import chaos service lazily to avoid circular deps
let chaosServiceImport: any = null;
const getChaosService = () => {
  if (!chaosServiceImport) {
    chaosServiceImport = require("./chaos.service").chaosService;
  }
  return chaosServiceImport;
};

// ============ Types ============

export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "minor" | "major" | "critical";
export type IncidentType = "outage" | "degraded" | "maintenance" | "security";

export interface Incident {
  _id?: ObjectId;
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  type: IncidentType;
  affectedServices: string[];
  updates: IncidentUpdate[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  scheduledFor?: Date; // For maintenance
  scheduledUntil?: Date; // For maintenance
  createdBy: string;
  isPublic: boolean;
}

export interface IncidentUpdate {
  id: string;
  message: string;
  status: IncidentStatus;
  createdAt: Date;
  createdBy: string;
}

export interface CreateIncidentInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  type: IncidentType;
  affectedServices: string[];
  createdBy: string;
  isPublic?: boolean;
  scheduledFor?: Date;
  scheduledUntil?: Date;
}

export interface UpdateIncidentInput {
  title?: string;
  description?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  affectedServices?: string[];
  isPublic?: boolean;
}

export interface AddIncidentUpdateInput {
  message: string;
  status: IncidentStatus;
  createdBy: string;
}

// ============ Service ============

class IncidentsService {
  private static instance: IncidentsService;
  private collectionName = "incidents";

  private constructor() {}

  static getInstance(): IncidentsService {
    if (!IncidentsService.instance) {
      IncidentsService.instance = new IncidentsService();
    }
    return IncidentsService.instance;
  }

  private getDB() {
    return getExperiencesDB();
  }

  /**
   * Generate a unique incident ID
   */
  private generateIncidentId(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INC-${year}${month}${day}-${random}`;
  }

  /**
   * Generate a unique update ID
   */
  private generateUpdateId(): string {
    return `UPD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  }

  /**
   * Create a new incident
   */
  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const db = this.getDB();
    
    const incident: Incident = {
      id: this.generateIncidentId(),
      title: input.title,
      description: input.description,
      status: "investigating",
      severity: input.severity,
      type: input.type,
      affectedServices: input.affectedServices,
      updates: [
        {
          id: this.generateUpdateId(),
          message: `Incident created: ${input.description}`,
          status: "investigating",
          createdAt: new Date(),
          createdBy: input.createdBy,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: input.createdBy,
      isPublic: input.isPublic ?? true,
      scheduledFor: input.scheduledFor,
      scheduledUntil: input.scheduledUntil,
    };

    await db.insertDocument(this.collectionName, incident);
    logger.info("Incidents", `Created incident ${incident.id}: ${incident.title}`);

    return incident;
  }

  /**
   * Get all incidents
   */
  async getAllIncidents(options?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    type?: IncidentType;
    isPublic?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ incidents: Incident[]; total: number }> {
    const db = this.getDB();
    
    // Build query
    const query: Record<string, any> = {};
    if (options?.status) query.status = options.status;
    if (options?.severity) query.severity = options.severity;
    if (options?.type) query.type = options.type;
    if (options?.isPublic !== undefined) query.isPublic = options.isPublic;

    const incidents = await db.findDocuments(this.collectionName, query);
    
    // Sort by createdAt descending
    incidents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const total = incidents.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const paginated = incidents.slice(offset, offset + limit);

    return { incidents: paginated, total };
  }

  /**
   * Get active incidents (not resolved)
   */
  async getActiveIncidents(): Promise<Incident[]> {
    const db = this.getDB();
    
    const incidents = await db.findDocuments(this.collectionName, {
      status: { $ne: "resolved" },
    });
    
    // Sort by severity and then createdAt
    const severityOrder: Record<IncidentSeverity, number> = {
      critical: 0,
      major: 1,
      minor: 2,
    };
    
    incidents.sort((a: Incident, b: Incident) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return incidents;
  }

  /**
   * Get public incidents for status page
   */
  async getPublicIncidents(limit: number = 20): Promise<Incident[]> {
    const { incidents } = await this.getAllIncidents({
      isPublic: true,
      limit,
    });
    return incidents;
  }

  /**
   * Get incident by ID
   */
  async getIncidentById(incidentId: string): Promise<Incident | null> {
    const db = this.getDB();
    
    const incidents = await db.findDocuments(this.collectionName, { id: incidentId });
    return incidents.length > 0 ? incidents[0] : null;
  }

  /**
   * Update incident
   */
  async updateIncident(incidentId: string, input: UpdateIncidentInput): Promise<Incident | null> {
    const db = this.getDB();
    
    const incident = await this.getIncidentById(incidentId);
    if (!incident) return null;

    const updates: Partial<Incident> = {
      ...input,
      updatedAt: new Date(),
    };

    // If resolving, set resolvedAt
    if (input.status === "resolved" && incident.status !== "resolved") {
      updates.resolvedAt = new Date();
    }

    await db.updateDocument(this.collectionName, { id: incidentId }, updates);
    logger.info("Incidents", `Updated incident ${incidentId}`);

    return this.getIncidentById(incidentId);
  }

  /**
   * Add update to incident
   */
  async addIncidentUpdate(incidentId: string, input: AddIncidentUpdateInput): Promise<Incident | null> {
    const db = this.getDB();
    
    const incident = await this.getIncidentById(incidentId);
    if (!incident) return null;

    const update: IncidentUpdate = {
      id: this.generateUpdateId(),
      message: input.message,
      status: input.status,
      createdAt: new Date(),
      createdBy: input.createdBy,
    };

    // Add update to array
    incident.updates.push(update);

    const updates: Partial<Incident> = {
      status: input.status,
      updates: incident.updates,
      updatedAt: new Date(),
    };

    // If resolving, set resolvedAt
    if (input.status === "resolved" && incident.status !== "resolved") {
      updates.resolvedAt = new Date();
    }

    await db.updateDocument(this.collectionName, { id: incidentId }, updates);
    logger.info("Incidents", `Added update to incident ${incidentId}: ${input.status}`);

    return this.getIncidentById(incidentId);
  }

  /**
   * Delete incident
   */
  async deleteIncident(incidentId: string): Promise<boolean> {
    const db = this.getDB();
    
    const incident = await this.getIncidentById(incidentId);
    if (!incident) return false;

    await db.deleteDocument(this.collectionName, { id: incidentId });
    logger.info("Incidents", `Deleted incident ${incidentId}`);

    return true;
  }

  /**
   * Get incident statistics
   */
  async getIncidentStats(): Promise<{
    total: number;
    active: number;
    resolved: number;
    byStatus: Record<IncidentStatus, number>;
    bySeverity: Record<IncidentSeverity, number>;
    byType: Record<IncidentType, number>;
    averageResolutionTime: number; // in minutes
    last30Days: number;
  }> {
    const { incidents, total } = await this.getAllIncidents({ limit: 10000 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      total,
      active: 0,
      resolved: 0,
      byStatus: {
        investigating: 0,
        identified: 0,
        monitoring: 0,
        resolved: 0,
      } as Record<IncidentStatus, number>,
      bySeverity: {
        minor: 0,
        major: 0,
        critical: 0,
      } as Record<IncidentSeverity, number>,
      byType: {
        outage: 0,
        degraded: 0,
        maintenance: 0,
        security: 0,
      } as Record<IncidentType, number>,
      averageResolutionTime: 0,
      last30Days: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    incidents.forEach((incident) => {
      // Count by status
      stats.byStatus[incident.status]++;
      if (incident.status === "resolved") {
        stats.resolved++;
      } else {
        stats.active++;
      }

      // Count by severity
      stats.bySeverity[incident.severity]++;

      // Count by type
      stats.byType[incident.type]++;

      // Calculate resolution time
      if (incident.status === "resolved" && incident.resolvedAt) {
        const resolutionTime = new Date(incident.resolvedAt).getTime() - new Date(incident.createdAt).getTime();
        totalResolutionTime += resolutionTime;
        resolvedCount++;
      }

      // Count last 30 days
      if (new Date(incident.createdAt) > thirtyDaysAgo) {
        stats.last30Days++;
      }
    });

    // Calculate average resolution time in minutes
    if (resolvedCount > 0) {
      stats.averageResolutionTime = Math.round(totalResolutionTime / resolvedCount / 60000);
    }

    return stats;
  }

  /**
   * Get service status based on active incidents AND chaos testing
   */
  async getServiceStatus(): Promise<{
    overall: "operational" | "degraded" | "partial_outage" | "major_outage";
    services: Record<string, "operational" | "degraded" | "outage">;
    activeIncidents: number;
    chaosMode?: boolean;
  }> {
    const activeIncidents = await this.getActiveIncidents();

    // Define all services
    const allServices = [
      "api",
      "auth",
      "database",
      "cdn",
      "websocket",
      "payments",
      "launcher",
    ];

    // Initialize all services as operational
    const services: Record<string, "operational" | "degraded" | "outage"> = {};
    allServices.forEach((service) => {
      services[service] = "operational";
    });

    // Check chaos service for injected failures
    const chaosService = getChaosService();
    let chaosMode = false;
    
    if (chaosService && chaosService.isEnabled()) {
      chaosMode = true;
      const chaosFailures = chaosService.getActiveFailures();
      
      for (const failure of chaosFailures) {
        const status = chaosService.getServiceStatus(failure.service);
        if (status === "outage") {
          services[failure.service] = "outage";
        } else if (status === "degraded" && services[failure.service] !== "outage") {
          services[failure.service] = "degraded";
        }
      }
    }

    // Update service status based on active incidents
    activeIncidents.forEach((incident) => {
      incident.affectedServices.forEach((service) => {
        if (incident.type === "outage" || incident.severity === "critical") {
          services[service] = "outage";
        } else if (services[service] !== "outage") {
          services[service] = "degraded";
        }
      });
    });

    // Determine overall status
    const serviceStatuses = Object.values(services);
    let overall: "operational" | "degraded" | "partial_outage" | "major_outage" = "operational";

    const outageCount = serviceStatuses.filter((s) => s === "outage").length;
    const degradedCount = serviceStatuses.filter((s) => s === "degraded").length;

    if (outageCount >= allServices.length / 2) {
      overall = "major_outage";
    } else if (outageCount > 0) {
      overall = "partial_outage";
    } else if (degradedCount > 0) {
      overall = "degraded";
    }

    return {
      overall,
      services,
      activeIncidents: activeIncidents.length,
      chaosMode,
    };
  }
}

// Export singleton
export const incidentsService = IncidentsService.getInstance();
export default incidentsService;
