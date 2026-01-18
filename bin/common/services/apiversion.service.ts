/**
 * API Version Management Service
 * 
 * Manages API versions, deprecations, and changelog
 */

import { getExperiencesDB } from "./database.service";
import { logger } from "./logger.service";

// ============ Types ============

export type VersionStatus = "current" | "stable" | "deprecated" | "sunset";

export interface APIVersion {
  version: string;
  status: VersionStatus;
  releaseDate: Date;
  deprecationDate?: Date;
  sunsetDate?: Date;
  changelog: ChangelogEntry[];
  endpoints: EndpointInfo[];
  breakingChanges?: string[];
  migrationGuide?: string;
}

export interface ChangelogEntry {
  id: string;
  date: Date;
  type: "feature" | "fix" | "breaking" | "security" | "deprecation";
  title: string;
  description: string;
  affectedEndpoints?: string[];
}

export interface EndpointInfo {
  path: string;
  method: string;
  status: "active" | "deprecated" | "removed";
  deprecatedSince?: string;
  removedIn?: string;
  replacement?: string;
  description: string;
}

export interface DeprecationNotice {
  id: string;
  endpoint: string;
  method: string;
  version: string;
  deprecatedSince: Date;
  sunsetDate?: Date;
  replacement?: string;
  reason: string;
  migrationSteps?: string[];
  createdAt: Date;
  isActive: boolean;
}

// ============ In-Memory Version Data ============
// This could be moved to database if needed

const API_VERSIONS: APIVersion[] = [
  {
    version: "v0",
    status: "current",
    releaseDate: new Date("2025-01-01"),
    changelog: [
      {
        id: "v0-initial",
        date: new Date("2025-01-01"),
        type: "feature",
        title: "Initial API Release",
        description: "First public release of the Reach API",
        affectedEndpoints: ["All endpoints"],
      },
      {
        id: "v0-admin-panel",
        date: new Date("2025-01-15"),
        type: "feature",
        title: "Admin Panel Endpoints",
        description: "Added developer admin panel endpoints for system monitoring and control",
        affectedEndpoints: ["/api/v0/admin/*"],
      },
      {
        id: "v0-status-page",
        date: new Date("2025-01-15"),
        type: "feature",
        title: "Status Page Endpoints",
        description: "Added public status page endpoints for service health monitoring",
        affectedEndpoints: ["/api/v0/status/*"],
      },
    ],
    endpoints: [
      { path: "/api/v0/auth", method: "ALL", status: "active", description: "Authentication endpoints" },
      { path: "/api/v0/instances", method: "ALL", status: "active", description: "Instance management" },
      { path: "/api/v0/players", method: "ALL", status: "active", description: "Player management" },
      { path: "/api/v0/organizations", method: "ALL", status: "active", description: "Organization management" },
      { path: "/api/v0/marketplace", method: "ALL", status: "active", description: "Marketplace endpoints" },
      { path: "/api/v0/overlay", method: "ALL", status: "active", description: "Overlay service" },
      { path: "/api/v0/payments", method: "ALL", status: "active", description: "Payment processing" },
      { path: "/api/v0/storage", method: "ALL", status: "active", description: "File storage" },
      { path: "/api/v0/updates", method: "ALL", status: "active", description: "Update service" },
      { path: "/api/v0/status", method: "ALL", status: "active", description: "Status page" },
      { path: "/api/v0/admin", method: "ALL", status: "active", description: "Admin panel" },
    ],
  },
];

// ============ Service ============

class APIVersionService {
  private static instance: APIVersionService;
  private collectionName = "api_deprecations";
  private versions = API_VERSIONS;

  private constructor() {}

  static getInstance(): APIVersionService {
    if (!APIVersionService.instance) {
      APIVersionService.instance = new APIVersionService();
    }
    return APIVersionService.instance;
  }

  private getDB() {
    return getExperiencesDB();
  }

  /**
   * Get all API versions
   */
  getAllVersions(): APIVersion[] {
    return this.versions;
  }

  /**
   * Get current API version
   */
  getCurrentVersion(): APIVersion | undefined {
    return this.versions.find((v) => v.status === "current");
  }

  /**
   * Get version by name
   */
  getVersion(version: string): APIVersion | undefined {
    return this.versions.find((v) => v.version === version);
  }

  /**
   * Get all changelogs
   */
  getChangelog(version?: string): ChangelogEntry[] {
    if (version) {
      const v = this.getVersion(version);
      return v?.changelog || [];
    }

    // Return all changelogs sorted by date
    const allChangelogs: ChangelogEntry[] = [];
    this.versions.forEach((v) => {
      v.changelog.forEach((entry) => {
        allChangelogs.push({ ...entry, id: `${v.version}-${entry.id}` });
      });
    });

    return allChangelogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Add changelog entry
   */
  addChangelogEntry(version: string, entry: Omit<ChangelogEntry, "id">): ChangelogEntry | null {
    const v = this.versions.find((ver) => ver.version === version);
    if (!v) return null;

    const newEntry: ChangelogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };

    v.changelog.unshift(newEntry);
    logger.info("APIVersion", `Added changelog entry: ${entry.title}`);

    return newEntry;
  }

  /**
   * Get all deprecated endpoints
   */
  getDeprecatedEndpoints(): EndpointInfo[] {
    const deprecated: EndpointInfo[] = [];
    
    this.versions.forEach((v) => {
      v.endpoints
        .filter((e) => e.status === "deprecated")
        .forEach((e) => {
          deprecated.push({ ...e, deprecatedSince: v.version });
        });
    });

    return deprecated;
  }

  /**
   * Create deprecation notice
   */
  async createDeprecationNotice(notice: Omit<DeprecationNotice, "id" | "createdAt" | "isActive">): Promise<DeprecationNotice> {
    const db = this.getDB();

    const deprecation: DeprecationNotice = {
      ...notice,
      id: `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date(),
      isActive: true,
    };

    await db.insertDocument(this.collectionName, deprecation);
    logger.warn("APIVersion", `Created deprecation notice: ${notice.endpoint} (${notice.method})`);

    return deprecation;
  }

  /**
   * Get all deprecation notices
   */
  async getDeprecationNotices(activeOnly: boolean = true): Promise<DeprecationNotice[]> {
    const db = this.getDB();
    
    const query = activeOnly ? { isActive: true } : {};
    const notices = await db.findDocuments(this.collectionName, query);

    return notices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Get deprecation notice by endpoint
   */
  async getDeprecationNoticeForEndpoint(endpoint: string, method: string): Promise<DeprecationNotice | null> {
    const db = this.getDB();
    
    const notices = await db.findDocuments(this.collectionName, {
      endpoint,
      method: method.toUpperCase(),
      isActive: true,
    });

    return notices.length > 0 ? notices[0] : null;
  }

  /**
   * Deactivate deprecation notice
   */
  async deactivateDeprecationNotice(id: string): Promise<boolean> {
    const db = this.getDB();
    
    await db.updateDocument(this.collectionName, { id }, { isActive: false });
    logger.info("APIVersion", `Deactivated deprecation notice: ${id}`);

    return true;
  }

  /**
   * Get API summary
   */
  getAPISummary(): {
    currentVersion: string;
    totalEndpoints: number;
    activeEndpoints: number;
    deprecatedEndpoints: number;
    versions: { version: string; status: VersionStatus; endpointCount: number }[];
  } {
    const current = this.getCurrentVersion();
    let totalEndpoints = 0;
    let activeEndpoints = 0;
    let deprecatedEndpoints = 0;

    const versions = this.versions.map((v) => {
      const active = v.endpoints.filter((e) => e.status === "active").length;
      const deprecated = v.endpoints.filter((e) => e.status === "deprecated").length;
      
      totalEndpoints += v.endpoints.length;
      activeEndpoints += active;
      deprecatedEndpoints += deprecated;

      return {
        version: v.version,
        status: v.status,
        endpointCount: v.endpoints.length,
      };
    });

    return {
      currentVersion: current?.version || "unknown",
      totalEndpoints,
      activeEndpoints,
      deprecatedEndpoints,
      versions,
    };
  }

  /**
   * Get version health/support info
   */
  getVersionHealth(): {
    version: string;
    status: VersionStatus;
    releaseDate: Date;
    supportedUntil?: Date;
    daysUntilSunset?: number;
  }[] {
    return this.versions.map((v) => {
      const health: {
        version: string;
        status: VersionStatus;
        releaseDate: Date;
        supportedUntil?: Date;
        daysUntilSunset?: number;
      } = {
        version: v.version,
        status: v.status,
        releaseDate: v.releaseDate,
      };

      if (v.sunsetDate) {
        health.supportedUntil = v.sunsetDate;
        const now = new Date();
        const daysUntil = Math.ceil((v.sunsetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        health.daysUntilSunset = Math.max(0, daysUntil);
      }

      return health;
    });
  }
}

// Export singleton
export const apiVersionService = APIVersionService.getInstance();
export default apiVersionService;
