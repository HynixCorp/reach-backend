/**
 * Overlay WebSocket Types
 * Types for the game overlay system similar to Steam/Discord
 */

// ============ Targeting Types ============

/**
 * Target types for message delivery:
 * - user: Send to a specific user by their Minecraft UUID
 * - experience: Send to all users connected to a specific experience/instance
 * - global: Send to all users connected to Reach
 */
export type MessageTargetType = "user" | "experience" | "global";

export interface MessageTarget {
  type: MessageTargetType;
  id?: string; // userId (Minecraft UUID) for "user", experienceId for "experience", not needed for "global"
}

// ============ Presence Types ============

export type PresenceStatus = "online" | "playing" | "idle" | "offline";

export interface PresencePayload {
  status: PresenceStatus;
  details?: string; // "In Menu" | "Singleplayer" | "Server Name"
  experienceId?: string; // The experience/instance the user is currently in
}

export interface UserPresence {
  userId: string;
  socketId: string;
  status: PresenceStatus;
  details?: string;
  experienceId?: string; // Current experience/instance ID
  connectedAt: Date;
  lastUpdate: Date;
}

// ============ Achievement Types ============

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon?: string;
  category?: string;
  rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";
  points?: number;
  createdAt: Date;
  createdBy?: string; // Server ID that registered it
}

export interface UserAchievement {
  odaid: string;
  odauid: string;
  odaunlockedAt: Date;
}

export interface AchievementUnlockPayload {
  title: string;
  description: string;
  icon?: string;
  rarity?: string;
}

// ============ Toast Types ============

export interface ToastPayload {
  title: string;
  description: string;
  duration?: number; // Default 5000ms
  type?: "info" | "success" | "warning" | "error";
}

// ============ Overlay Command Types ============

export type OverlayCommand = "open" | "close" | "refresh" | "toggle";

export interface OverlayCommandPayload {
  command: OverlayCommand;
}

// ============ Friends Types (Future) ============

export interface Friend {
  id: string;
  displayName: string;
  status: PresenceStatus;
  currentServer?: string | null;
  avatar?: string;
}

export interface FriendsListPayload {
  friends: Friend[];
}

export interface FriendStatusUpdatePayload {
  id: string;
  status: PresenceStatus;
  currentServer?: string | null;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
}

// ============ WebSocket Message Types ============

export type ClientMessageType = 
  | "PRESENCE_UPDATE"
  | "JOIN_EXPERIENCE"
  | "LEAVE_EXPERIENCE"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPT"
  | "FRIEND_REJECT";

export type ServerMessageType = 
  | "ACHIEVEMENT_UNLOCK"
  | "TOAST"
  | "OVERLAY_COMMAND"
  | "FRIENDS_LIST"
  | "FRIEND_STATUS_UPDATE"
  | "PRESENCE_CONFIRMED"
  | "EXPERIENCE_JOINED"
  | "EXPERIENCE_LEFT"
  | "ERROR";

export interface WebSocketMessage<T = any> {
  type: ClientMessageType | ServerMessageType;
  payload: T;
}

// Client -> Server Messages
export interface PresenceUpdateMessage extends WebSocketMessage<PresencePayload> {
  type: "PRESENCE_UPDATE";
}

// Server -> Client Messages
export interface AchievementUnlockMessage extends WebSocketMessage<AchievementUnlockPayload> {
  type: "ACHIEVEMENT_UNLOCK";
}

export interface ToastMessage extends WebSocketMessage<ToastPayload> {
  type: "TOAST";
}

export interface OverlayCommandMessage extends WebSocketMessage<OverlayCommandPayload> {
  type: "OVERLAY_COMMAND";
}

export interface FriendsListMessage extends WebSocketMessage<FriendsListPayload> {
  type: "FRIENDS_LIST";
}

export interface FriendStatusUpdateMessage extends WebSocketMessage<FriendStatusUpdatePayload> {
  type: "FRIEND_STATUS_UPDATE";
}

export interface PresenceConfirmedMessage extends WebSocketMessage<{ status: string }> {
  type: "PRESENCE_CONFIRMED";
}

export interface ErrorMessage extends WebSocketMessage<{ message: string; code?: string }> {
  type: "ERROR";
}

// ============ Connection Types ============

export interface OverlayConnection {
  socketId: string;
  userId: string;
  connectedAt: Date;
}

// ============ Database Document Types ============

export interface AchievementDocument {
  _id?: string;
  id: string;
  title: string;
  description: string;
  icon?: string;
  category?: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  points: number;
  serverId?: string; // For server-specific achievements
  isGlobal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAchievementDocument {
  _id?: string;
  odauid: string;
  odaid: string;
  unlockedAt: Date;
  serverId?: string; // Where it was unlocked
}

export interface UserPresenceDocument {
  _id?: string;
  oduid: string;
  lastStatus: PresenceStatus;
  lastDetails?: string;
  lastExperienceId?: string;
  lastSeen: Date;
  totalOnlineTime: number; // In seconds
}

// ============ Experience/Instance Tracking ============

export interface ExperienceConnection {
  odaeid: string;
  connectedUsers: string[]; // Array of userIds
}

// ============ Targeted Message Types ============

export interface TargetedToastPayload extends ToastPayload {
  target: MessageTarget;
}

export interface TargetedAchievementPayload extends AchievementUnlockPayload {
  target: MessageTarget;
}

export interface TargetedCommandPayload {
  command: OverlayCommand;
  target: MessageTarget;
}
