/**
 * Centralized API Configuration and Constants
 * 
 * This file contains all API routes, versions, and configuration
 * to avoid hardcoding and enable easy maintenance.
 */

// ============================================================================
// API VERSIONS
// ============================================================================

export const API_VERSIONS = {
  V0: "v0",
  V1: "v1",
} as const;

export type ApiVersion = typeof API_VERSIONS[keyof typeof API_VERSIONS];

export const CURRENT_API_VERSION = API_VERSIONS.V0;

// ============================================================================
// API BASE PATHS
// ============================================================================

export const API_PATHS = {
  // Core services
  AUTH: "/api/auth",
  ORGANIZATIONS: "/api/organizations",
  PAYMENTS: "/api/payments",
  INSTANCES: "/api/instances",
  CLOUD: "/api/cloud",
  STATUS: "/api/status",
  ADMIN: "/api/admin",
  
  // Game/Player services
  OVERLAY: "/api/overlay",
  MARKETPLACE: "/api/marketplace",
  PLAYER_AUTH: "/api/player-auth",
  
  // Infrastructure
  UPDATES: "/api/updates",
  ATHENAS: "/api/athenas",
} as const;

// ============================================================================
// FULL API ROUTES (with version)
// ============================================================================

export const API_ROUTES = {
  // Auth routes
  AUTH: {
    BASE: `${API_PATHS.AUTH}/${CURRENT_API_VERSION}`,
    CREATE: "/create",
    GET: "/get",
    SETUP_FINISH: "/setup/finish",
    GET_SESSION: "/get-session",
  },
  
  // Organizations routes
  ORGANIZATIONS: {
    BASE: `${API_PATHS.ORGANIZATIONS}/${CURRENT_API_VERSION}`,
    CREATE: "/create",
    CREATE_LINK: "/create/link",
    JOIN: "/join",
    DECLINE: "/decline",
    RENEW_LINK: "/renew/link",
    DELETE_LINK: "/delete/link",
    UPDATE_ASSETS: "/update/assets",
    UPDATE_INFO: "/update/information",
    DELETE_MEMBER: "/member",
    GET_BY_USER: "/user/:userId",
    GET_INFO_BY_LINK: "/information/link/:key",
    GET_INFO_BY_ID: "/information/:organizationId/:executor",
    GET_ALL_INFO: "/information",
  },
  
  // Payments routes
  PAYMENTS: {
    BASE: `${API_PATHS.PAYMENTS}/${CURRENT_API_VERSION}`,
    CREATE: "/create",
    SUCCESS: "/success",
    CANCEL: "/cancel",
    CREATE_PORTAL: "/create/portal",
    INFO: "/info",
    USAGE_INFO: "/usage/info",
    WEBHOOK: "/webhook",
  },
  
  // Cloud/Storage routes
  CLOUD: {
    BASE: `${API_PATHS.CLOUD}/${CURRENT_API_VERSION}`,
    CREATE_INSTANCE: "/instances",
    UPDATE_INSTANCE: "/:instanceId",
    CREATE_VERSION: "/:instanceId/versions",
    GET_VERSIONS: "/:instanceId/versions",
    UPDATE_VERSION_ASSETS: "/:instanceId/versions/:versionHash/assets",
    ACTIVATE_VERSION: "/:instanceId/versions/:versionHash/activate",
    APPROVE_VERSION: "/:instanceId/versions/:versionHash/approve",
    BROWSE_VERSION_FILES: "/:instanceId/versions/:versionHash/files",
    COMPARE_VERSIONS: "/:instanceId/versions/:hashA/compare/:hashB",
    CHECK_UPDATE: "/:instanceId/check-update",
    MANIFEST: "/:instanceId/manifest",
    CHECKSUM: "/:instanceId/checksum",
    LOGS: "/:instanceId/logs",
  },
  
  // Instances routes
  INSTANCES: {
    BASE: `${API_PATHS.INSTANCES}/${CURRENT_API_VERSION}`,
    MANIFEST: "/manifest/get",
    INFORMATION: "/information/get",
    GET_ALL: "/:orgId/all/get",
    REQUEST_PERMISSION: "/permission/request",
    CREATE_CODE: "/code/create",
  },
  
  // Status routes
  STATUS: {
    BASE: `${API_PATHS.STATUS}/${CURRENT_API_VERSION}`,
    FULL: "/",
    HEALTH: "/health",
    READY: "/ready",
    LIVE: "/live",
    DATABASES: "/databases",
    SERVICES: "/services",
    SYSTEM: "/system",
    PROCESS: "/process",
    LOGS: "/logs",
    LOGS_BY_DATE: "/logs/:date",
    SUMMARY: "/summary",
  },
  
  // Admin routes (athenas.reachx.dev)
  ADMIN: {
    BASE: `${API_PATHS.ADMIN}/${CURRENT_API_VERSION}`,
    DASHBOARD: "/dashboard",
    SERVICE_STATUS: "/service-status",
    METRICS: {
      ALL: "/metrics",
      SYSTEM: "/metrics/system",
      PROCESS: "/metrics/process",
      TRAFFIC: "/metrics/traffic",
      DATABASE: "/metrics/database",
    },
    PROCESS: {
      STATUS: "/process/status",
      RESTART: "/process/restart",
      LOGS: "/process/logs",
    },
    HEALTH: {
      STATUS: "/health",
      DEPENDENCIES: "/health/dependencies",
    },
    INCIDENTS: {
      LIST: "/incidents",
      ACTIVE: "/incidents/active",
      STATS: "/incidents/stats",
      BY_ID: "/incidents/:id",
      CREATE: "/incidents",
      UPDATE: "/incidents/:id",
      ADD_UPDATE: "/incidents/:id/updates",
      DELETE: "/incidents/:id",
    },
    API_VERSIONS: {
      LIST: "/api-versions",
      CURRENT: "/api-versions/current",
      CHANGELOG: "/api-versions/changelog",
      ADD_CHANGELOG: "/api-versions/changelog",
      DEPRECATIONS: "/api-versions/deprecations",
      CREATE_DEPRECATION: "/api-versions/deprecations",
    },
  },
  
  // Overlay routes
  OVERLAY: {
    BASE: `${API_PATHS.OVERLAY}/${CURRENT_API_VERSION}`,
  },
  
  // Marketplace routes
  MARKETPLACE: {
    BASE: `${API_PATHS.MARKETPLACE}/${CURRENT_API_VERSION}`,
  },
  
  // Updates routes
  UPDATES: {
    BASE: `${API_PATHS.UPDATES}/${CURRENT_API_VERSION}`,
  },
  
  // Athenas routes
  ATHENAS: {
    BASE: `${API_PATHS.ATHENAS}/${CURRENT_API_VERSION}`,
  },
} as const;

// ============================================================================
// HTTP METHODS
// ============================================================================

export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS",
} as const;

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ============================================================================
// REQUIRED HEADERS
// ============================================================================

export const REQUIRED_HEADERS = {
  USER_AGENT: "User-Agent",
  X_API_KEY: "x-api-key",
  X_REACH_TOKEN: "x-reach-token",
  AUTHORIZATION: "Authorization",
  CONTENT_TYPE: "Content-Type",
  MACHINE_ID: "machine-id",
  DEVICE_ID: "device-id",
} as const;

// ============================================================================
// CDN PATHS
// ============================================================================

export const CDN_PATHS = {
  BASE: "/cdn",
  UPDATES: "/cdn/updates",
  INSTANCES_ASSETS: "/cdn/instances/assets",
  INSTANCES_PACKAGES: "/cdn/instances/packages",
  INSTANCES_ARCHIVES: "/cdn/instances/experience-archives",
  INSTANCES_FOLDERS: "/cdn/instances/experience-folders",
} as const;

// ============================================================================
// RESOURCE PATHS
// ============================================================================

export const RESOURCE_PATHS = {
  BASE: "/assets/resources",
  EXP_UP: "/assets/resources/exp_up.markdown",
  LEGAL: "/assets/resources/legal.markdown",
  PRIVACY: "/assets/resources/privacy.markdown",
  THIRDPARTY: "/assets/resources/thirdparty.markdown",
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build full API URL with version
 */
export function buildApiUrl(basePath: string, route: string = ""): string {
  return `${basePath}/${CURRENT_API_VERSION}${route}`;
}

/**
 * Build versioned route
 */
export function versionedRoute(path: string, version: ApiVersion = CURRENT_API_VERSION): string {
  return `/${version}${path}`;
}

/**
 * Replace route parameters
 */
export function buildRoute(route: string, params: Record<string, string>): string {
  let result = route;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
}
