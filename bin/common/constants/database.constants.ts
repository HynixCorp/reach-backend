/**
 * Database Constants and Configuration
 * 
 * Centralized database names, collection names, and indexes
 */

// ============================================================================
// DATABASE NAMES
// ============================================================================

export const DATABASE_NAMES = {
  DEVELOPERS: "reach_developers",
  PLAYERS: "reach_players",
  EXPERIENCES: "reach_experiences",
  OVERLAY: "reach_overlay",
} as const;

// ============================================================================
// COLLECTION NAMES
// ============================================================================

export const COLLECTIONS = {
  // reach_developers collections
  DEVELOPERS: {
    USER: "user",
    ACCOUNT: "account",
    SESSION: "session",
    VERIFICATION: "verification",
    ORGANIZATIONS: "organizations",
    ORGANIZATION_LINKS: "organizationLinks",
    PAYMENTS: "payments",
    USAGE: "usage",
    LINKED_XBOX_ACCOUNTS: "linkedXboxAccounts",
  },
  
  // reach_players collections
  PLAYERS: {
    PLAYERS: "players",
    INVENTORY: "inventory",
    ACHIEVEMENTS: "achievements",
    BANS: "bans",
    SESSIONS: "sessions",
  },
  
  // reach_experiences collections
  EXPERIENCES: {
    INSTANCES: "instances",
    INSTANCE_VERSIONS: "instance_versions",
    INSTANCE_CODES: "instanceCodes",
    INSTANCE_LOGS: "instance_logs",
    MARKETPLACE: "marketplace",
    STATUS: "status",
  },
  
  // reach_overlay collections
  OVERLAY: {
    PRESENCES: "presences",
    ACHIEVEMENTS: "achievements",
    NOTIFICATIONS: "notifications",
  },
} as const;

// ============================================================================
// DATABASE INDEXES
// ============================================================================

export const INDEXES = {
  DEVELOPERS: {
    ORGANIZATIONS: [
      { key: { ownerId: 1 }, name: "idx_organizations_ownerId" },
      { key: { name: 1 }, name: "idx_organizations_name", unique: true },
      { key: { "members.userId": 1 }, name: "idx_organizations_members" },
    ],
    ORGANIZATION_LINKS: [
      { key: { temporaryToken: 1 }, name: "idx_orgLinks_token", unique: true },
      { key: { organizationId: 1 }, name: "idx_orgLinks_orgId" },
      { key: { expirationDate: 1 }, name: "idx_orgLinks_expiration", expireAfterSeconds: 0 },
    ],
    PAYMENTS: [
      { key: { betterAuthId: 1 }, name: "idx_payments_baId" },
      { key: { status: 1 }, name: "idx_payments_status" },
    ],
    USAGE: [
      { key: { auth: 1 }, name: "idx_usage_auth", unique: true },
    ],
  },
  
  PLAYERS: {
    PLAYERS: [
      { key: { minecraftUuid: 1 }, name: "idx_players_mcUuid", unique: true },
      { key: { xboxGamertag: 1 }, name: "idx_players_gamertag" },
    ],
    INVENTORY: [
      { key: { playerId: 1 }, name: "idx_inventory_playerId" },
      { key: { "games.instanceId": 1 }, name: "idx_inventory_games" },
    ],
    BANS: [
      { key: { minecraftUuid: 1 }, name: "idx_bans_mcUuid" },
      { key: { instanceId: 1 }, name: "idx_bans_instanceId" },
      { key: { expiresAt: 1 }, name: "idx_bans_expiration" },
    ],
    SESSIONS: [
      { key: { sessionId: 1 }, name: "idx_sessions_id", unique: true },
      { key: { playerId: 1 }, name: "idx_sessions_playerId" },
      { key: { expiresAt: 1 }, name: "idx_sessions_expiration", expireAfterSeconds: 0 },
    ],
  },
  
  EXPERIENCES: {
    INSTANCES: [
      { key: { id: 1 }, name: "idx_instances_id", unique: true },
      { key: { organizationId: 1 }, name: "idx_instances_orgId" },
      { key: { name: 1 }, name: "idx_instances_name" },
      { key: { status: 1 }, name: "idx_instances_status" },
    ],
    INSTANCE_VERSIONS: [
      { key: { versionHash: 1 }, name: "idx_versions_hash", unique: true },
      { key: { instanceId: 1 }, name: "idx_versions_instanceId" },
      { key: { instanceId: 1, active: 1 }, name: "idx_versions_active" },
    ],
    INSTANCE_CODES: [
      { key: { code: 1 }, name: "idx_codes_code", unique: true },
      { key: { id: 1 }, name: "idx_codes_instanceId" },
    ],
    INSTANCE_LOGS: [
      { key: { instanceId: 1 }, name: "idx_logs_instanceId" },
      { key: { timestamp: -1 }, name: "idx_logs_timestamp" },
    ],
  },
  
  OVERLAY: {
    PRESENCES: [
      { key: { playerId: 1 }, name: "idx_presences_playerId", unique: true },
      { key: { lastSeen: 1 }, name: "idx_presences_lastSeen" },
    ],
    ACHIEVEMENTS: [
      { key: { playerId: 1 }, name: "idx_achievements_playerId" },
      { key: { instanceId: 1 }, name: "idx_achievements_instanceId" },
    ],
    NOTIFICATIONS: [
      { key: { playerId: 1 }, name: "idx_notifications_playerId" },
      { key: { read: 1 }, name: "idx_notifications_read" },
      { key: { createdAt: 1 }, name: "idx_notifications_created" },
    ],
  },
} as const;

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Build a MongoDB query for organization membership
 */
export function buildMembershipQuery(userId: string): object {
  return {
    $or: [
      { members: { $elemMatch: { userId } } },
      { members: userId },
    ],
  };
}

/**
 * Build a MongoDB query for active versions
 */
export function buildActiveVersionQuery(instanceId: string): object {
  return {
    instanceId,
    active: true,
  };
}

/**
 * Build a MongoDB query for pagination
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
  sortField?: string;
  sortOrder?: 1 | -1;
}

export function buildPaginatedQuery(
  baseQuery: object,
  options: PaginationOptions
): { query: object; skip: number; limit: number; sort: object } {
  const { limit, offset, sortField = "createdAt", sortOrder = -1 } = options;
  return {
    query: baseQuery,
    skip: offset,
    limit,
    sort: { [sortField]: sortOrder },
  };
}
