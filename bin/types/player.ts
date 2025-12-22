/**
 * Player Types (Xbox/Microsoft Auth)
 * Types for players authenticated via Xbox/Microsoft
 * Stored in: reach_players database
 */

// ============ Player Profile ============

/**
 * Xbox/Microsoft authenticated player profile
 * Collection: players
 */
export interface PlayerProfile {
  id: string; // Internal Reach player ID (nanoid)
  
  // Xbox/Microsoft Identity
  xboxUserId?: string; // Xbox User ID (XUID)
  xboxGamertag?: string; // Xbox Gamertag (alternative name)
  gamertag?: string; // Xbox Gamertag
  minecraftUuid?: string; // Minecraft Java UUID
  minecraftUsername?: string; // Minecraft username
  ownsMinecraft?: boolean; // Whether they own Minecraft Java Edition
  
  // Profile Data
  avatar?: string; // Xbox profile picture URL
  email?: string; // Microsoft account email (optional)
  name?: string; // Display name from Microsoft
  
  // Account linking
  linkedDeveloperAccountId?: string; // If linked to a developer account
  
  // Ban status
  banned?: string; // "none" | "temporal" | "permanent"
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  
  // Device Info (from last login)
  lastMachineId?: string;
  lastDeviceId?: string;
}

/**
 * Player session from Xbox Auth
 * Collection: sessions
 */
export interface PlayerSession {
  id: string;
  playerId: string; // Reference to PlayerProfile.id
  
  // Xbox tokens (encrypted)
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  
  // Session metadata
  deviceId: string;
  machineId: string;
  ipAddress?: string;
  userAgent?: string;
  
  createdAt: Date;
  lastUsedAt: Date;
}

// ============ Player Inventory ============

/**
 * Game ownership entry in player's inventory
 */
export interface OwnedGame {
  instanceId: string; // Reference to experience/instance
  acquiredAt: Date;
  acquisitionType: "free" | "purchased" | "gifted" | "code";
  
  // Purchase info (if purchased)
  purchaseId?: string;
  purchaseAmount?: number;
  purchaseCurrency?: string;
  
  // Code redemption (if acquired via code)
  redeemedCode?: string;
}

/**
 * Player inventory document
 * Collection: inventory
 */
export interface PlayerInventory {
  playerId: string; // Reference to PlayerProfile.id
  
  // Owned games/experiences
  games: OwnedGame[];
  
  // Future: cosmetics, items, etc.
  // cosmetics?: OwnedCosmetic[];
  
  updatedAt: Date;
}

// ============ Player Achievements ============

/**
 * Unlocked achievement for a player
 * Collection: achievements
 */
export interface PlayerAchievement {
  playerId: string; // Reference to PlayerProfile.id
  achievementId: string; // Reference to achievement definition
  
  unlockedAt: Date;
  experienceId?: string; // Where it was unlocked (if experience-specific)
  
  // Progress tracking (for progressive achievements)
  progress?: number;
  maxProgress?: number;
}

// ============ Player Bans ============

export type BanType = "none" | "temporal" | "permanent";
export type BanScope = "global" | "experience";

/**
 * Ban entry for a player
 * Collection: bans
 */
export interface PlayerBan {
  id: string;
  playerId: string; // Reference to PlayerProfile.id
  
  // Ban type
  type: BanType;
  
  // Ban scope
  scope: BanScope;
  experienceIds?: string[]; // If scope is "experience", which experiences
  
  // Ban details
  reason: string;
  issuedBy: string; // Developer/admin who issued the ban
  issuedAt: Date;
  
  // For temporal bans
  expiresAt?: Date;
  
  // Appeal info
  appealable: boolean;
  appealedAt?: Date;
  appealStatus?: "pending" | "approved" | "rejected";
  appealNotes?: string;
  
  // Status
  active: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  revokeReason?: string;
}

/**
 * Computed ban status for a player
 */
export interface PlayerBanStatus {
  isBanned: boolean;
  isGloballyBanned: boolean;
  globalBan?: PlayerBan;
  experienceBans: PlayerBan[];
  bannedExperienceIds: string[];
}

// ============ Player State (for Overlay) ============

/**
 * Current player state for overlay service
 * This is mostly in-memory but can be persisted
 */
export interface PlayerState {
  playerId: string;
  
  // Online status
  isOnline: boolean;
  status: "online" | "playing" | "idle" | "offline";
  statusDetails?: string;
  
  // Current experience
  currentExperienceId?: string;
  currentServerId?: string; // If in a multiplayer server within experience
  
  // Connection info
  connectedAt?: Date;
  lastActivityAt: Date;
}

// ============ Linked Accounts ============

/**
 * Link between Xbox player account and Developer (Better-Auth) account
 * Stored in: reach_developers.linkedXboxAccounts
 */
export interface LinkedXboxAccount {
  id: string; // Unique link ID
  developerId: string; // Better-Auth user ID
  playerId: string; // Reference to PlayerProfile.id
  xboxGamertag: string; // Xbox gamertag
  xboxUserId: string; // Xbox XUID
  minecraftUuid?: string; // Minecraft UUID (optional)
  
  linkedAt: Date;
  linkedBy?: "developer" | "player"; // Who initiated the link (optional)
  
  // Permissions granted by player to developer (optional)
  permissions?: {
    viewProfile: boolean;
    viewInventory: boolean;
    viewAchievements: boolean;
  };
}

// ============ API Request/Response Types ============

/**
 * Xbox authentication request
 */
export interface XboxAuthRequest {
  xboxToken: string; // Xbox Live token
  deviceId: string;
  machineId: string;
}

/**
 * Xbox authentication response
 */
export interface XboxAuthResponse {
  player: PlayerProfile;
  session: {
    id: string;
    expiresAt: Date;
  };
  isNewPlayer: boolean;
}

/**
 * Player profile update request
 */
export interface UpdatePlayerProfileRequest {
  gamertag?: string; // Usually updated from Xbox
  avatar?: string;
}

/**
 * Inventory update (add game)
 */
export interface AddToInventoryRequest {
  instanceId: string;
  acquisitionType: OwnedGame["acquisitionType"];
  code?: string; // If using redemption code
  purchaseId?: string; // If purchased
}
