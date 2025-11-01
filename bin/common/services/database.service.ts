import { config } from "dotenv";
import { MongoDB } from "../mongodb/mongodb";

config();

/**
 * Centralized database service to provide singleton instances
 * and better connection management across the application
 */
class DatabaseService {
  private static instance: DatabaseService;
  private reachDB: MongoDB;
  private reachAuthDB: MongoDB;
  private reachSDKDB: MongoDB;
  
  private constructor() {
    const dbUri = process.env.DB_URI as string;
    
    this.reachDB = new MongoDB(dbUri, "reach");
    this.reachAuthDB = new MongoDB(dbUri, "reachauth");
    this.reachSDKDB = new MongoDB(dbUri, "reach");
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
  
  /**
   * Get reach database instance
   */
  public getReachDB(): MongoDB {
    return this.reachDB;
  }
  
  /**
   * Get reachauth database instance
   */
  public getReachAuthDB(): MongoDB {
    return this.reachAuthDB;
  }
  
  /**
   * Get reach SDK database instance (alias for reach)
   */
  public getReachSDKDB(): MongoDB {
    return this.reachSDKDB;
  }
  
  /**
   * Initialize all database connections
   */
  public async connectAll(): Promise<void> {
    try {
      await Promise.all([
        this.reachDB.connect(),
        this.reachAuthDB.connect(),
        this.reachSDKDB.connect()
      ]);
    } catch (error) {
      console.error("[Database Service]: Failed to connect to databases:", error);
      throw error;
    }
  }
  
  /**
   * Close all database connections
   */
  public async closeAll(): Promise<void> {
    await Promise.all([
      this.reachDB.close(),
      this.reachAuthDB.close(),
      this.reachSDKDB.close()
    ]);
  }
}

// Export singleton instance getter
export const getDatabaseService = () => DatabaseService.getInstance();

// Export convenience methods for direct access
export const getReachDB = () => getDatabaseService().getReachDB();
export const getReachAuthDB = () => getDatabaseService().getReachAuthDB();
export const getReachSDKDB = () => getDatabaseService().getReachSDKDB();
