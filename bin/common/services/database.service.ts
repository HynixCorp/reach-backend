import { config } from "dotenv";
import { MongoDB } from "../mongodb/mongodb";
import { initializeDatabases, checkDatabaseHealth } from "./database.init";

config();

/**
 * Database Architecture for Reach Platform
 * =========================================
 * 
 * reach_developers - Developer accounts (Better-Auth managed)
 *   Collections: user, account, sessions, verifications, 
 *                organizations, organizationLinks, payments, usage, linkedXboxAccounts
 * 
 * reach_players - Player accounts (Xbox/Microsoft Auth)
 *   Collections: players, inventory, achievements, bans, sessions
 * 
 * reach_experiences - Game content and instances
 *   Collections: instances, instanceVersions, instanceCodes, instanceLogs, marketplace
 * 
 * reach_overlay - Real-time overlay service
 *   Collections: presences, achievements, notifications
 */
class DatabaseService {
  private static instance: DatabaseService;
  
  // New architecture databases
  private developersDB: MongoDB;
  private playersDB: MongoDB;
  private experiencesDB: MongoDB;
  private overlayDB: MongoDB;
  private dbUri: string;
  
  private constructor() {
    this.dbUri = process.env.DB_URI as string;
    
    // New database structure
    this.developersDB = new MongoDB(this.dbUri, "reach_developers");
    this.playersDB = new MongoDB(this.dbUri, "reach_players");
    this.experiencesDB = new MongoDB(this.dbUri, "reach_experiences");
    this.overlayDB = new MongoDB(this.dbUri, "reach_overlay");
  }
  
  /**
   * Get singleton instance of DatabaseService
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }
  
  // ============ New Architecture Methods ============
  
  /**
   * Get developers database (Better-Auth accounts, organizations, payments)
   * Collections: user, account, sessions, verifications, organizations, 
   *              organizationLinks, payments, usage, linkedXboxAccounts
   */
  public getDevelopersDB(): MongoDB {
    return this.developersDB;
  }
  
  /**
   * Get players database (Xbox/Microsoft authenticated players)
   * Collections: players, inventory, achievements, bans, sessions
   */
  public getPlayersDB(): MongoDB {
    return this.playersDB;
  }
  
  /**
   * Get experiences database (instances/content)
   * Collections: instances, instanceVersions, instanceCodes, instanceLogs, marketplace
   */
  public getExperiencesDB(): MongoDB {
    return this.experiencesDB;
  }
  
  /**
   * Get overlay database (real-time overlay service)
   * Collections: presences, achievements, notifications
   */
  public getOverlayDB(): MongoDB {
    return this.overlayDB;
  }
  
  // ============ Legacy Aliases (for backwards compatibility during migration) ============
  
  /**
   * @deprecated Use getDevelopersDB() for auth/org data or getExperiencesDB() for instances
   */
  public getReachDB(): MongoDB {
    console.warn("[REACHX - DB Service] getReachDB() is deprecated. Use getExperiencesDB() or getPlayersDB()");
    return this.experiencesDB;
  }
  
  /**
   * @deprecated Use getDevelopersDB() instead
   */
  public getReachAuthDB(): MongoDB {
    console.warn("[REACHX - DB Service] getReachAuthDB() is deprecated. Use getDevelopersDB()");
    return this.developersDB;
  }
  
  /**
   * @deprecated Use getExperiencesDB() instead
   */
  public getReachSDKDB(): MongoDB {
    console.warn("[REACHX - DB Service] getReachSDKDB() is deprecated. Use getExperiencesDB()");
    return this.experiencesDB;
  }
  
  /**
   * Initialize all database connections
   * Automatically creates databases and collections if they don't exist
   */
  public async connectAll(): Promise<void> {
    try {
      console.log("[REACHX - DB Service] Checking database health...".cyan);
      
      // Check if databases need initialization
      const health = await checkDatabaseHealth(this.dbUri);
      
      if (!health.healthy) {
        console.log("[REACHX - DB Service] Initializing missing databases/collections...".yellow);
        await initializeDatabases(this.dbUri);
      }
      
      console.log("[REACHX - DB Service] Connecting to databases...".cyan);
      await Promise.all([
        this.developersDB.connect(),
        this.playersDB.connect(),
        this.experiencesDB.connect(),
        this.overlayDB.connect()
      ]);
      console.log("[REACHX - DB Service] All databases connected successfully".green);
    } catch (error) {
      console.error("[REACHX - DB Service] Failed to connect to databases:".red, error);
      throw error;
    }
  }
  
  /**
   * Close all database connections
   */
  public async closeAll(): Promise<void> {
    await Promise.all([
      this.developersDB.close(),
      this.playersDB.close(),
      this.experiencesDB.close(),
      this.overlayDB.close()
    ]);
  }
}

// Export singleton instance getter
export const getDatabaseService = () => DatabaseService.getInstance();

// ============ New Architecture Exports ============
export const getDevelopersDB = () => getDatabaseService().getDevelopersDB();
export const getPlayersDB = () => getDatabaseService().getPlayersDB();
export const getExperiencesDB = () => getDatabaseService().getExperiencesDB();
export const getOverlayDB = () => getDatabaseService().getOverlayDB();

// ============ Legacy Exports (deprecated) ============
/** @deprecated Use getDevelopersDB() for auth or getExperiencesDB() for instances */
export const getReachDB = () => getDatabaseService().getReachDB();
/** @deprecated Use getDevelopersDB() instead */
export const getReachAuthDB = () => getDatabaseService().getReachAuthDB();
/** @deprecated Use getExperiencesDB() instead */
export const getReachSDKDB = () => getDatabaseService().getReachSDKDB();
