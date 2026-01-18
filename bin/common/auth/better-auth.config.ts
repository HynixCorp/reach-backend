/**
 * Better-Auth Configuration
 * 
 * This module configures Better-Auth for the Reach Backend with two authentication flows:
 * 
 * 1. DEVELOPER AUTH (Web Dashboard):
 *    - Email/Password authentication via Better-Auth core
 *    - Stores sessions in reach_developers database
 *    - Used by front-end dashboard for developer accounts
 * 
 * 2. PLAYER AUTH (Xbox/Microsoft):
 *    - Microsoft OAuth for Xbox Live authentication
 *    - Stores player profiles in reach_players database
 *    - Used by Minecraft launcher for player accounts
 */

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient, Db } from "mongodb";
import { logger } from "../services/logger.service";

// Database URIs
const DB_URI = process.env.DB_URI || "mongodb://localhost:27017/";
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

// Microsoft OAuth credentials
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "consumers";

// Debug: Check if Microsoft credentials are configured
if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
  logger.warn("Better-Auth", "MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET not configured!");
  logger.warn("Better-Auth", "Player authentication with Microsoft will NOT work.");
} else {
  logger.info("Better-Auth", "Microsoft OAuth credentials configured");
}

// MongoDB clients for Better-Auth (singleton pattern)
let developersDb: Db | null = null;
let playersDb: Db | null = null;

/**
 * Get or create the developers database connection
 */
async function getDevelopersDbForAuth(): Promise<Db> {
  if (!developersDb) {
    const client = new MongoClient(DB_URI);
    await client.connect();
    developersDb = client.db("reach_developers");
  }
  return developersDb;
}

/**
 * Get or create the players database connection
 */
async function getPlayersDbForAuth(): Promise<Db> {
  if (!playersDb) {
    const client = new MongoClient(DB_URI);
    await client.connect();
    playersDb = client.db("reach_players");
  }
  return playersDb;
}

// Initialize connections synchronously for Better-Auth
// These will be lazy-initialized on first use
const developersClient = new MongoClient(DB_URI);
const playersClient = new MongoClient(DB_URI);

/**
 * Better-Auth instance for DEVELOPER authentication (Web Dashboard)
 * 
 * Features:
 * - Email/Password login
 * - Session management
 * - Organization support (handled separately)
 * 
 * Database: reach_developers
 * Collections: user, account, sessions, verifications
 */
export const developerAuth = betterAuth({
  baseURL: BASE_URL,
  basePath: "/api/auth/developer",
  secret: process.env.BETTER_AUTH_SECRET,
  
  database: mongodbAdapter(developersClient.db("reach_developers")),
  
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
    sendResetPassword: async ({ user, url }) => {
      // TODO: Implement password reset email via Resend
      logger.info("Better-Auth", `Password reset requested for ${user.email}`);
      logger.debug("Better-Auth", `Reset URL: ${url}`);
    }
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5 // 5 minutes
    }
  },
  
  user: {
    additionalFields: {
      newaccount: {
        type: "boolean",
        defaultValue: true,
        required: false
      }
    }
  },
  
  trustedOrigins: [
    process.env.DASHBOARD_URL || "http://localhost:3001",
    "http://localhost:3000",
    "http://localhost:3001"
  ]
});

/**
 * Better-Auth instance for PLAYER authentication (Xbox/Microsoft)
 * 
 * Features:
 * - Microsoft OAuth (Xbox Live)
 * - Xbox Gamertag retrieval
 * - Minecraft UUID linking
 * 
 * Database: reach_players
 * Collections: players, sessions
 */
export const playerAuth = betterAuth({
  baseURL: BASE_URL,
  basePath: "/api/auth/player",
  secret: process.env.BETTER_AUTH_SECRET,
  
  database: mongodbAdapter(playersClient.db("reach_players")),
  
  socialProviders: {
    microsoft: {
      clientId: MICROSOFT_CLIENT_ID,
      clientSecret: MICROSOFT_CLIENT_SECRET,
      tenantId: MICROSOFT_TENANT_ID,
      // Use standard scopes first, Xbox scopes will be handled separately
      scope: ["openid", "profile", "email", "offline_access"]
    }
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days for players
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },
  
  user: {
    additionalFields: {
      xboxGamertag: {
        type: "string",
        required: false
      },
      xboxUserId: {
        type: "string",
        required: false
      },
      minecraftUuid: {
        type: "string",
        required: false
      },
      minecraftUsername: {
        type: "string", 
        required: false
      },
      linkedDeveloperAccountId: {
        type: "string",
        required: false
      },
      banned: {
        type: "string",
        defaultValue: "none",
        required: false
      }
    }
  },
  
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:8080",
    "tauri://localhost",
    "https://tauri.localhost"
  ]
});

// Debug: Log available API endpoints
logger.debug("Better-Auth", "Player Auth API available at: /api/auth/player/*");

/**
 * Initialize Better-Auth MongoDB connections
 * Call this before using auth handlers
 */
export async function initBetterAuthConnections(): Promise<void> {
  try {
    await developersClient.connect();
    await playersClient.connect();
    logger.info("Better-Auth", "MongoDB connections established");
  } catch (error) {
    logger.error("Better-Auth", `Failed to connect to MongoDB: ${error}`);
    throw error;
  }
}

/**
 * Export auth handler for Express routes
 */
export const developerAuthHandler = developerAuth.handler;
export const playerAuthHandler = playerAuth.handler;

logger.debug("Better-Auth", "Configuration loaded");
