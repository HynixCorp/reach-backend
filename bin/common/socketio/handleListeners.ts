import "colorts/lib/string";
import { Client as SocketIOClient } from "./client";
import {
  registerConnection,
  unregisterConnection,
  updatePresence,
  getUserIdBySocket,
  joinExperience,
  leaveExperience,
  getUserExperience,
} from "../services/overlay.service";
import { PresencePayload, WebSocketMessage } from "../../types/overlay";

/**
 * Check if we're in development mode
 */
const isDevelopment = (): boolean => {
  return process.env.NODE_ENV !== "production";
};

/**
 * Auto-generated user ID for development mode when no auth is provided
 */
let devUserCounter = 0;
const generateDevUserId = (socketId: string): string => {
  devUserCounter++;
  return `dev-user-${devUserCounter}-${socketId.substring(0, 6)}`;
};

export function setupListeners(socketIOClient: SocketIOClient) {
  // Legacy listeners for backwards compatibility
  socketIOClient.listenEvent("message", (socket, message) => {
    console.log(`[REACH - Socket] Received message from ${socket.id}: ${message}`.blue);
  });

  socketIOClient.listenEvent("custom_event", (socket, data) => {
    console.log(`[REACH - Socket] Custom event from ${socket.id}:`.blue, data);
  });

  // ============ Overlay Authentication ============
  
  /**
   * Client sends this event to identify themselves
   * Format: { userId: string, experienceId?: string }
   * 
   * In DEVELOPMENT mode: userId is optional, will auto-generate if missing
   * In PRODUCTION mode: userId is required
   */
  socketIOClient.listenEvent("overlay_auth", (socket, data: { userId?: string; experienceId?: string }) => {
    let userId: string;
    let experienceId: string | undefined;
    
    // === PRODUCTION MODE: Require authentication ===
    if (!isDevelopment()) {
      if (!data || !data.userId) {
        socket.emit("overlay_message", {
          type: "ERROR",
          payload: { message: "Missing userId in authentication", code: "AUTH_MISSING_USER" }
        });
        return;
      }
      userId = data.userId;
      experienceId = data.experienceId;
    } 
    // === DEVELOPMENT MODE: Auto-generate userId if not provided ===
    else {
      if (!data || !data.userId) {
        userId = generateDevUserId(socket.id);
        console.log(`[REACH - Overlay] DEV MODE: Auto-generated userId: ${userId}`.yellow);
      } else {
        userId = data.userId;
      }
      experienceId = data?.experienceId;
    }
    
    // Register the connection
    registerConnection(socket.id, userId);
    
    // Join experience if provided
    if (experienceId) {
      joinExperience(userId, experienceId);
    }
    
    // Send confirmation
    socket.emit("overlay_message", {
      type: "PRESENCE_CONFIRMED",
      payload: { 
        status: "authenticated", 
        userId,
        experienceId: experienceId || null,
        // Include dev mode info
        devMode: isDevelopment(),
      }
    });
    
    console.log(`[REACH - Overlay] User ${userId} authenticated on socket ${socket.id}${experienceId ? ` (experience: ${experienceId})` : ''}${isDevelopment() ? ' [DEV]' : ''}`.green);
  });

  // ============ Development Mode: Auto-connect without auth ============
  
  /**
   * In DEVELOPMENT mode only: automatically register connection even without overlay_auth
   * This allows testing without explicit authentication
   */
  if (isDevelopment()) {
    socketIOClient.listenEvent("overlay_dev_connect", (socket, data?: { userId?: string; experienceId?: string }) => {
      const userId = data?.userId || generateDevUserId(socket.id);
      
      registerConnection(socket.id, userId);
      
      if (data?.experienceId) {
        joinExperience(userId, data.experienceId);
      }
      
      socket.emit("overlay_message", {
        type: "PRESENCE_CONFIRMED",
        payload: { 
          status: "dev_authenticated", 
          userId,
          experienceId: data?.experienceId || null,
          devMode: true,
        }
      });
      
      console.log(`[REACH - Overlay] DEV: Quick connect for ${userId}`.yellow);
    });
  }

  // ============ Presence Update ============
  
  /**
   * Client sends presence updates
   * Format: { type: "PRESENCE_UPDATE", payload: { status, details, experienceId? } }
   * 
   * In DEVELOPMENT mode: If not authenticated, auto-register with dev userId
   * In PRODUCTION mode: Requires prior authentication
   */
  socketIOClient.listenEvent("overlay_message", (socket, message: WebSocketMessage) => {
    if (!message || !message.type) {
      socket.emit("overlay_message", {
        type: "ERROR",
        payload: { message: "Invalid message format", code: "INVALID_FORMAT" }
      });
      return;
    }
    
    let userId = getUserIdBySocket(socket.id);
    
    // === DEVELOPMENT MODE: Auto-register if not authenticated ===
    if (!userId && isDevelopment()) {
      userId = generateDevUserId(socket.id);
      registerConnection(socket.id, userId);
      console.log(`[REACH - Overlay] DEV: Auto-registered ${userId} on message`.yellow);
    }
    
    // === PRODUCTION MODE: Require authentication ===
    /* 
    // PRODUCTION AUTH CHECK - Uncomment for production
    if (!userId) {
      socket.emit("overlay_message", {
        type: "ERROR",
        payload: { message: "Not authenticated. Send overlay_auth first.", code: "NOT_AUTHENTICATED" }
      });
      return;
    }
    */
    
    // For now in development, if still no userId, return error
    if (!userId) {
      socket.emit("overlay_message", {
        type: "ERROR",
        payload: { message: "Not authenticated. Send overlay_auth first.", code: "NOT_AUTHENTICATED" }
      });
      return;
    }
    
    switch (message.type) {
      case "PRESENCE_UPDATE":
        handlePresenceUpdate(socket, userId, message.payload as PresencePayload);
        break;
      
      case "JOIN_EXPERIENCE":
        handleJoinExperience(socket, userId, message.payload as { experienceId: string });
        break;
        
      case "LEAVE_EXPERIENCE":
        handleLeaveExperience(socket, userId);
        break;
        
      default:
        console.log(`[REACH - Overlay] Unknown message type from ${userId}: ${message.type}`.yellow);
    }
  });

  // ============ Disconnect Handler ============
  
  /**
   * Handle socket disconnection
   * This is called automatically when the client disconnects
   */
  socketIOClient.listenEvent("disconnect", (socket) => {
    const userId = getUserIdBySocket(socket.id);
    if (userId) {
      console.log(`[REACH - Overlay] User ${userId} disconnecting from socket ${socket.id}`.yellow);
    }
    unregisterConnection(socket.id);
  });
  
  // Log mode on setup
  if (isDevelopment()) {
    console.log(`[REACH - Overlay] ⚠️  DEVELOPMENT MODE: Client authentication is relaxed`.yellow);
    console.log(`[REACH - Overlay] ⚠️  Use 'overlay_dev_connect' for quick testing`.yellow);
  } else {
    console.log(`[REACH - Overlay] 🔒 PRODUCTION MODE: Client authentication required`.green);
  }
}

/**
 * Handle presence update from client
 */
function handlePresenceUpdate(socket: any, userId: string, payload: PresencePayload) {
  if (!payload || !payload.status) {
    socket.emit("overlay_message", {
      type: "ERROR",
      payload: { message: "Invalid presence payload", code: "INVALID_PRESENCE" }
    });
    return;
  }
  
  const validStatuses = ["online", "playing", "idle", "offline"];
  if (!validStatuses.includes(payload.status)) {
    socket.emit("overlay_message", {
      type: "ERROR",
      payload: { message: `Invalid status. Valid: ${validStatuses.join(", ")}`, code: "INVALID_STATUS" }
    });
    return;
  }
  
  const success = updatePresence(userId, payload);
  
  if (success) {
    socket.emit("overlay_message", {
      type: "PRESENCE_CONFIRMED",
      payload: { 
        status: payload.status, 
        details: payload.details,
        experienceId: payload.experienceId || getUserExperience(userId) || null
      }
    });
  }
}

/**
 * Handle join experience request
 */
function handleJoinExperience(socket: any, userId: string, payload: { experienceId: string }) {
  if (!payload || !payload.experienceId) {
    socket.emit("overlay_message", {
      type: "ERROR",
      payload: { message: "Missing experienceId", code: "MISSING_EXPERIENCE_ID" }
    });
    return;
  }
  
  const success = joinExperience(userId, payload.experienceId);
  
  if (success) {
    socket.emit("overlay_message", {
      type: "EXPERIENCE_JOINED",
      payload: { experienceId: payload.experienceId }
    });
  } else {
    socket.emit("overlay_message", {
      type: "ERROR",
      payload: { message: "Failed to join experience", code: "JOIN_FAILED" }
    });
  }
}

/**
 * Handle leave experience request
 */
function handleLeaveExperience(socket: any, userId: string) {
  const currentExperience = getUserExperience(userId);
  const success = leaveExperience(userId);
  
  if (success) {
    socket.emit("overlay_message", {
      type: "EXPERIENCE_LEFT",
      payload: { experienceId: currentExperience }
    });
  } else {
    socket.emit("overlay_message", {
      type: "ERROR",
      payload: { message: "Not in any experience", code: "NOT_IN_EXPERIENCE" }
    });
  }
}