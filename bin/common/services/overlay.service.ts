/**
 * Overlay Service
 * Handles presence management, achievements, and overlay notifications
 * Supports targeting: user (Minecraft UUID), experience (instance), or global (all Reach users)
 */
import "colorts/lib/string";
import { getOverlayDB, getPlayersDB } from "./database.service";
import {
  UserPresence,
  PresenceStatus,
  PresencePayload,
  AchievementDocument,
  UserAchievementDocument,
  ToastPayload,
  AchievementUnlockPayload,
  OverlayCommand,
  WebSocketMessage,
  UserPresenceDocument,
  MessageTarget,
  MessageTargetType,
} from "../../types/overlay";
import { socketBridge } from "../socketio/bridge";

/**
 * In-memory storage for active user presences
 * Maps userId (Minecraft UUID) to UserPresence data
 */
const activePresences: Map<string, UserPresence> = new Map();

/**
 * Maps socketId to userId for quick lookup on disconnect
 */
const socketToUser: Map<string, string> = new Map();

/**
 * Maps userId to array of socketIds (for multiple connections)
 */
const userToSockets: Map<string, string[]> = new Map();

/**
 * Maps experienceId to array of userIds (users in each experience/instance)
 */
const experienceToUsers: Map<string, Set<string>> = new Map();

/**
 * Maps userId to experienceId (which experience each user is in)
 */
const userToExperience: Map<string, string> = new Map();

// ============ Connection Management ============

/**
 * Register a new user connection
 */
export function registerConnection(socketId: string, userId: string): void {
  // Map socket to user
  socketToUser.set(socketId, userId);
  
  // Add socket to user's socket list
  const existingSockets = userToSockets.get(userId) || [];
  if (!existingSockets.includes(socketId)) {
    existingSockets.push(socketId);
    userToSockets.set(userId, existingSockets);
  }
  
  // Create or update presence
  const existingPresence = activePresences.get(userId);
  if (existingPresence) {
    // User already connected (multiple clients)
    existingPresence.socketId = socketId; // Update to latest socket
    existingPresence.lastUpdate = new Date();
  } else {
    // New connection
    activePresences.set(userId, {
      userId,
      socketId,
      status: "online",
      connectedAt: new Date(),
      lastUpdate: new Date(),
    });
  }
  
  console.log(`[REACH - Overlay] User ${userId} connected (socket: ${socketId})`.green);
}

/**
 * Unregister a user connection
 */
export function unregisterConnection(socketId: string): void {
  const userId = socketToUser.get(socketId);
  if (!userId) return;
  
  // Remove socket from maps
  socketToUser.delete(socketId);
  
  const userSockets = userToSockets.get(userId) || [];
  const filteredSockets = userSockets.filter(s => s !== socketId);
  
  if (filteredSockets.length === 0) {
    // No more connections, user is offline
    userToSockets.delete(userId);
    const presence = activePresences.get(userId);
    
    // Remove from experience if in one
    const currentExperience = userToExperience.get(userId);
    if (currentExperience) {
      leaveExperience(userId);
    }
    
    // Save last presence to database
    if (presence) {
      savePresenceToDatabase(userId, presence).catch(err => {
        console.error(`[REACH - Overlay] Failed to save presence for ${userId}:`, err);
      });
    }
    
    activePresences.delete(userId);
    console.log(`[REACH - Overlay] User ${userId} disconnected (all connections closed)`.yellow);
  } else {
    // Still has other connections
    userToSockets.set(userId, filteredSockets);
    const presence = activePresences.get(userId);
    if (presence) {
      presence.socketId = filteredSockets[filteredSockets.length - 1]; // Use latest socket
    }
    console.log(`[REACH - Overlay] User ${userId} closed one connection (${filteredSockets.length} remaining)`.blue);
  }
}

/**
 * Get user ID from socket ID
 */
export function getUserIdBySocket(socketId: string): string | undefined {
  return socketToUser.get(socketId);
}

/**
 * Get all socket IDs for a user
 */
export function getSocketsByUserId(userId: string): string[] {
  return userToSockets.get(userId) || [];
}

/**
 * Check if user is connected
 */
export function isUserConnected(userId: string): boolean {
  return activePresences.has(userId);
}

// ============ Experience Management ============

/**
 * Add user to an experience/instance
 */
export function joinExperience(userId: string, experienceId: string): boolean {
  if (!isUserConnected(userId)) {
    console.warn(`[REACH - Overlay] Cannot join experience: user ${userId} not connected`.yellow);
    return false;
  }
  
  // Leave current experience if in one
  const currentExperience = userToExperience.get(userId);
  if (currentExperience) {
    leaveExperience(userId);
  }
  
  // Add to new experience
  userToExperience.set(userId, experienceId);
  
  let experienceUsers = experienceToUsers.get(experienceId);
  if (!experienceUsers) {
    experienceUsers = new Set();
    experienceToUsers.set(experienceId, experienceUsers);
  }
  experienceUsers.add(userId);
  
  // Update presence
  const presence = activePresences.get(userId);
  if (presence) {
    presence.experienceId = experienceId;
    presence.lastUpdate = new Date();
  }
  
  console.log(`[REACH - Overlay] User ${userId} joined experience ${experienceId}`.green);
  return true;
}

/**
 * Remove user from their current experience
 */
export function leaveExperience(userId: string): boolean {
  const experienceId = userToExperience.get(userId);
  if (!experienceId) {
    return false;
  }
  
  // Remove from experience
  userToExperience.delete(userId);
  
  const experienceUsers = experienceToUsers.get(experienceId);
  if (experienceUsers) {
    experienceUsers.delete(userId);
    if (experienceUsers.size === 0) {
      experienceToUsers.delete(experienceId);
    }
  }
  
  // Update presence
  const presence = activePresences.get(userId);
  if (presence) {
    presence.experienceId = undefined;
    presence.lastUpdate = new Date();
  }
  
  console.log(`[REACH - Overlay] User ${userId} left experience ${experienceId}`.yellow);
  return true;
}

/**
 * Get all users in an experience
 */
export function getUsersInExperience(experienceId: string): string[] {
  const users = experienceToUsers.get(experienceId);
  return users ? Array.from(users) : [];
}

/**
 * Get user's current experience
 */
export function getUserExperience(userId: string): string | undefined {
  return userToExperience.get(userId);
}

/**
 * Get count of users in an experience
 */
export function getExperienceUserCount(experienceId: string): number {
  return experienceToUsers.get(experienceId)?.size || 0;
}

/**
 * Get all active experiences with user counts
 */
export function getAllExperiences(): { experienceId: string; userCount: number }[] {
  const experiences: { experienceId: string; userCount: number }[] = [];
  experienceToUsers.forEach((users, experienceId) => {
    experiences.push({ experienceId, userCount: users.size });
  });
  return experiences;
}

// ============ Presence Management ============

/**
 * Update user presence
 */
export function updatePresence(userId: string, payload: PresencePayload): boolean {
  const presence = activePresences.get(userId);
  if (!presence) {
    console.warn(`[REACH - Overlay] Cannot update presence for disconnected user: ${userId}`.yellow);
    return false;
  }
  
  presence.status = payload.status;
  presence.details = payload.details;
  presence.lastUpdate = new Date();
  
  // Handle experience join/leave via presence update
  if (payload.experienceId && payload.experienceId !== presence.experienceId) {
    joinExperience(userId, payload.experienceId);
  } else if (!payload.experienceId && presence.experienceId) {
    leaveExperience(userId);
  }
  
  console.log(`[REACH - Overlay] Updated presence for ${userId}: ${payload.status} - ${payload.details || 'N/A'} (experience: ${presence.experienceId || 'none'})`.cyan);
  return true;
}

/**
 * Get user presence
 */
export function getPresence(userId: string): UserPresence | undefined {
  return activePresences.get(userId);
}

/**
 * Get all active presences
 */
export function getAllPresences(): UserPresence[] {
  return Array.from(activePresences.values());
}

/**
 * Get presence count
 */
export function getPresenceCount(): number {
  return activePresences.size;
}

/**
 * Save presence to database for persistence
 */
async function savePresenceToDatabase(userId: string, presence: UserPresence): Promise<void> {
  const db = getOverlayDB();
  
  const existingDoc = await db.findDocuments("overlay_presences", { oduid: userId });
  
  const updateData: Partial<UserPresenceDocument> = {
    oduid: userId,
    lastStatus: presence.status,
    lastDetails: presence.details,
    lastExperienceId: presence.experienceId,
    lastSeen: new Date(),
  };
  
  if (existingDoc.length > 0) {
    // Calculate online time
    const onlineTime = Math.floor((new Date().getTime() - presence.connectedAt.getTime()) / 1000);
    await db.updateDocument("overlay_presences", { oduid: userId }, {
      $set: {
        lastStatus: updateData.lastStatus,
        lastDetails: updateData.lastDetails,
        lastSeen: updateData.lastSeen,
      },
      $inc: { totalOnlineTime: onlineTime }
    });
  } else {
    await db.insertDocument("overlay_presences", {
      ...updateData,
      totalOnlineTime: 0,
    });
  }
}

// ============ Message Sending ============

/**
 * Send a message to a specific user by Minecraft UUID (all their connections)
 */
export function sendToUser(userId: string, message: WebSocketMessage): boolean {
  const sockets = getSocketsByUserId(userId);
  if (sockets.length === 0) {
    console.warn(`[REACH - Overlay] Cannot send message to disconnected user: ${userId}`.yellow);
    return false;
  }
  
  try {
    const io = socketBridge.getIO();
    sockets.forEach(socketId => {
      io.to(socketId).emit("overlay_message", message);
    });
    console.log(`[REACH - Overlay] Sent ${message.type} to user ${userId}`.blue);
    return true;
  } catch (error) {
    console.error(`[REACH - Overlay] Failed to send message to user ${userId}:`, error);
    return false;
  }
}

/**
 * Send a message to all users in a specific experience/instance
 */
export function sendToExperience(experienceId: string, message: WebSocketMessage): number {
  const users = getUsersInExperience(experienceId);
  if (users.length === 0) {
    console.warn(`[REACH - Overlay] No users in experience ${experienceId}`.yellow);
    return 0;
  }
  
  let sentCount = 0;
  try {
    const io = socketBridge.getIO();
    users.forEach(userId => {
      const sockets = getSocketsByUserId(userId);
      sockets.forEach(socketId => {
        io.to(socketId).emit("overlay_message", message);
      });
      sentCount++;
    });
    console.log(`[REACH - Overlay] Sent ${message.type} to ${sentCount} users in experience ${experienceId}`.magenta);
  } catch (error) {
    console.error(`[REACH - Overlay] Failed to send message to experience ${experienceId}:`, error);
  }
  
  return sentCount;
}

/**
 * Broadcast message to all connected users (global)
 */
export function sendToAll(message: WebSocketMessage): number {
  try {
    const io = socketBridge.getIO();
    io.emit("overlay_message", message);
    const count = activePresences.size;
    console.log(`[REACH - Overlay] Broadcast ${message.type} to ${count} users (global)`.magenta);
    return count;
  } catch (error) {
    console.error(`[REACH - Overlay] Failed to broadcast message:`, error);
    return 0;
  }
}

/**
 * Send message based on target type
 * @param target - The target specification { type: "user"|"experience"|"global", id?: string }
 * @param message - The message to send
 * @returns Object with success status and count of recipients
 */
export function sendToTarget(target: MessageTarget, message: WebSocketMessage): { success: boolean; recipients: number } {
  switch (target.type) {
    case "user":
      if (!target.id) {
        console.error(`[REACH - Overlay] User target requires id (Minecraft UUID)`.red);
        return { success: false, recipients: 0 };
      }
      const userSuccess = sendToUser(target.id, message);
      return { success: userSuccess, recipients: userSuccess ? 1 : 0 };
      
    case "experience":
      if (!target.id) {
        console.error(`[REACH - Overlay] Experience target requires id (experienceId)`.red);
        return { success: false, recipients: 0 };
      }
      const experienceCount = sendToExperience(target.id, message);
      return { success: experienceCount > 0, recipients: experienceCount };
      
    case "global":
      const globalCount = sendToAll(message);
      return { success: globalCount > 0, recipients: globalCount };
      
    default:
      console.error(`[REACH - Overlay] Unknown target type: ${(target as any).type}`.red);
      return { success: false, recipients: 0 };
  }
}

/**
 * Send achievement unlock notification to a target
 */
export function sendAchievementUnlock(target: MessageTarget, achievement: AchievementUnlockPayload): { success: boolean; recipients: number } {
  return sendToTarget(target, {
    type: "ACHIEVEMENT_UNLOCK",
    payload: achievement,
  });
}

/**
 * Send toast notification to a target
 */
export function sendToast(target: MessageTarget, toast: ToastPayload): { success: boolean; recipients: number } {
  const toastWithDefaults: ToastPayload = {
    ...toast,
    duration: toast.duration || 5000,
    type: toast.type || "info",
  };
  
  return sendToTarget(target, {
    type: "TOAST",
    payload: toastWithDefaults,
  });
}

/**
 * Send overlay command to a target
 */
export function sendOverlayCommand(target: MessageTarget, command: OverlayCommand): { success: boolean; recipients: number } {
  return sendToTarget(target, {
    type: "OVERLAY_COMMAND",
    payload: { command },
  });
}

/**
 * Broadcast message to all connected users
 * @deprecated Use sendToAll or sendToTarget with type: "global" instead
 */
export function broadcastToAll(message: WebSocketMessage): void {
  sendToAll(message);
}

/**
 * Broadcast toast to all connected users
 * @deprecated Use sendToast with target { type: "global" } instead
 */
export function broadcastToast(toast: ToastPayload): void {
  sendToast({ type: "global" }, toast);
}

// ============ Achievement Management ============

/**
 * Get all achievements
 */
export async function getAllAchievements(): Promise<AchievementDocument[]> {
  const db = getOverlayDB();
  return await db.findDocuments("achievements", {});
}

/**
 * Get achievement by ID
 */
export async function getAchievementById(achievementId: string): Promise<AchievementDocument | null> {
  const db = getOverlayDB();
  const results = await db.findDocuments("achievements", { id: achievementId });
  return results.length > 0 ? results[0] : null;
}

/**
 * Create a new achievement
 */
export async function createAchievement(achievement: Omit<AchievementDocument, "_id" | "createdAt" | "updatedAt">): Promise<AchievementDocument> {
  const db = getOverlayDB();
  
  const newAchievement: AchievementDocument = {
    ...achievement,
    rarity: achievement.rarity || "common",
    points: achievement.points || 10,
    isGlobal: achievement.isGlobal ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  await db.insertDocument("achievements", newAchievement);
  console.log(`[REACH - Overlay] Created achievement: ${achievement.title}`.green);
  
  return newAchievement;
}

/**
 * Unlock achievement for a user
 */
export async function unlockAchievement(userId: string, achievementId: string, serverId?: string): Promise<boolean> {
  const db = getPlayersDB();
  
  // Check if already unlocked
  const existing = await db.findDocuments("achievements", {
    odauid: userId,
    odaid: achievementId,
  });
  
  if (existing.length > 0) {
    console.log(`[REACH - Overlay] Achievement ${achievementId} already unlocked for user ${userId}`.yellow);
    return false;
  }
  
  // Get achievement details
  const achievement = await getAchievementById(achievementId);
  if (!achievement) {
    console.error(`[REACH - Overlay] Achievement ${achievementId} not found`.red);
    return false;
  }
  
  // Record unlock
  const userAchievement: UserAchievementDocument = {
    odauid: userId,
    odaid: achievementId,
    unlockedAt: new Date(),
    serverId,
  };
  
  await db.insertDocument("achievements", userAchievement);
  
  // Notify user if connected (targeting specific user)
  if (isUserConnected(userId)) {
    sendAchievementUnlock({ type: "user", id: userId }, {
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      rarity: achievement.rarity,
    });
  }
  
  console.log(`[REACH - Overlay] Achievement ${achievement.title} unlocked for user ${userId}`.green);
  return true;
}

/**
 * Get user's unlocked achievements
 */
export async function getUserAchievements(userId: string): Promise<UserAchievementDocument[]> {
  const db = getPlayersDB();
  return await db.findDocuments("achievements", { odauid: userId });
}

/**
 * Check if user has achievement
 */
export async function hasAchievement(userId: string, achievementId: string): Promise<boolean> {
  const db = getPlayersDB();
  const results = await db.findDocuments("achievements", {
    odauid: userId,
    odaid: achievementId,
  });
  return results.length > 0;
}

// ============ Statistics ============

/**
 * Get overlay statistics
 */
export function getOverlayStats(): {
  connectedUsers: number;
  totalConnections: number;
  activeExperiences: number;
  statusBreakdown: Record<PresenceStatus, number>;
  experienceBreakdown: { experienceId: string; userCount: number }[];
} {
  const presences = getAllPresences();
  const statusBreakdown: Record<PresenceStatus, number> = {
    online: 0,
    playing: 0,
    idle: 0,
    offline: 0,
  };
  
  let totalConnections = 0;
  presences.forEach(p => {
    statusBreakdown[p.status]++;
    totalConnections += (userToSockets.get(p.userId)?.length || 0);
  });
  
  return {
    connectedUsers: presences.length,
    totalConnections,
    activeExperiences: experienceToUsers.size,
    statusBreakdown,
    experienceBreakdown: getAllExperiences(),
  };
}

// Export service object for convenience
export const OverlayService = {
  // Connection
  registerConnection,
  unregisterConnection,
  getUserIdBySocket,
  getSocketsByUserId,
  isUserConnected,
  
  // Experience Management
  joinExperience,
  leaveExperience,
  getUsersInExperience,
  getUserExperience,
  getExperienceUserCount,
  getAllExperiences,
  
  // Presence
  updatePresence,
  getPresence,
  getAllPresences,
  getPresenceCount,
  
  // Messaging (with targeting)
  sendToUser,
  sendToExperience,
  sendToAll,
  sendToTarget,
  sendAchievementUnlock,
  sendToast,
  sendOverlayCommand,
  broadcastToAll,
  broadcastToast,
  
  // Achievements
  getAllAchievements,
  getAchievementById,
  createAchievement,
  unlockAchievement,
  getUserAchievements,
  hasAchievement,
  
  // Stats
  getOverlayStats,
};
