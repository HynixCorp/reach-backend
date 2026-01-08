/**
 * Database Initialization Service
 * Creates databases and collections if they don't exist
 * Run this after a MongoDB wipe or on fresh installations
 */
import "colorts/lib/string";
import { MongoClient, IndexDirection } from "mongodb";
import { config } from "dotenv";

config();

/**
 * Index definition type
 */
interface IndexDefinition {
  key: { [field: string]: IndexDirection };
  unique?: boolean;
}

/**
 * Collection definition type
 */
interface CollectionDefinition {
  name: string;
  indexes?: IndexDefinition[];
}

/**
 * Database schema type
 */
interface DatabaseSchema {
  [dbName: string]: {
    collections: CollectionDefinition[];
  };
}

/**
 * Database schema definition
 * Maps database names to their collections with optional indexes
 */
const DATABASE_SCHEMA: DatabaseSchema = {
  // Developer accounts (Better-Auth managed)
  reach_developers: {
    collections: [
      // Better-Auth collections
      { name: "user", indexes: [{ key: { email: 1 }, unique: true }] },
      { name: "account", indexes: [{ key: { userId: 1 } }, { key: { providerId: 1, accountId: 1 } }] },
      { name: "session", indexes: [{ key: { token: 1 }, unique: true }, { key: { userId: 1 } }] },
      { name: "verification", indexes: [{ key: { identifier: 1 } }] },
      
      // Business collections
      { name: "organizations", indexes: [{ key: { ownerId: 1 } }, { key: { name: 1 }, unique: true }] },
      { name: "organizationLinks", indexes: [{ key: { temporaryToken: 1 }, unique: true }] },
      { name: "payments", indexes: [{ key: { betterAuthId: 1 } }, { key: { subscriptionId: 1 } }] },
      { name: "usage", indexes: [{ key: { auth: 1 }, unique: true }] },
      { name: "linkedXboxAccounts", indexes: [{ key: { developerId: 1 } }, { key: { xboxUserId: 1 } }] },
    ],
  },
  
  // Player accounts (Xbox/Microsoft Auth)
  reach_players: {
    collections: [
      { name: "players", indexes: [
        { key: { xboxUserId: 1 }, unique: true },
        { key: { minecraftUuid: 1 }, unique: true },
        { key: { gamertag: 1 } }
      ]},
      { name: "inventory", indexes: [{ key: { playerId: 1 }, unique: true }] },
      { name: "achievements", indexes: [{ key: { playerId: 1 } }, { key: { odauid: 1, odaid: 1 } }] },
      { name: "bans", indexes: [
        { key: { playerId: 1 } },
        { key: { active: 1 } },
        { key: { scope: 1 } }
      ]},
      { name: "sessions", indexes: [
        { key: { playerId: 1 } },
        { key: { id: 1 }, unique: true }
      ]},
    ],
  },
  
  // Game content and instances
  reach_experiences: {
    collections: [
      { name: "instances", indexes: [
        { key: { id: 1 }, unique: true },
        { key: { organizationId: 1 } },
        { key: { status: 1 } },
        { key: { ownerID: 1 } }
      ]},
      { name: "instance_versions", indexes: [
        { key: { instanceId: 1 } },
        { key: { versionHash: 1 }, unique: true },
        { key: { active: 1 } }
      ]},
      { name: "instanceCodes", indexes: [
        { key: { code: 1 }, unique: true },
        { key: { id: 1 } }
      ]},
      { name: "instance_logs", indexes: [
        { key: { instanceId: 1 } },
        { key: { timestamp: -1 } }
      ]},
      { name: "marketplace", indexes: [{ key: { instanceId: 1 } }] },
      { name: "status", indexes: [] },
    ],
  },
  
  // Real-time overlay service
  reach_overlay: {
    collections: [
      { name: "presences", indexes: [{ key: { oduid: 1 }, unique: true }] },
      { name: "achievements", indexes: [
        { key: { id: 1 }, unique: true },
        { key: { isGlobal: 1 } }
      ]},
      { name: "notifications", indexes: [
        { key: { oduid: 1 } },
        { key: { createdAt: -1 } }
      ]},
    ],
  },
};

/**
 * Initial data to seed into databases
 */
const SEED_DATA = {
  reach_experiences: {
    status: [
      {
        maintenance: false,
        maintenance_message: "",
        version: "1.0.0",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  },
};

/**
 * Initialize all databases and collections
 */
export async function initializeDatabases(uri: string): Promise<void> {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log("[REACHX - Database Manager] Connected to MongoDB".green);
    
    for (const [dbName, schema] of Object.entries(DATABASE_SCHEMA)) {
      console.log(`[REACHX - Database Manager] Initializing database: ${dbName}`.cyan);
      const db = client.db(dbName);
      
      // Get existing collections
      const existingCollections = await db.listCollections().toArray();
      const existingNames = existingCollections.map(c => c.name);
      
      for (const collectionDef of schema.collections) {
        const { name, indexes } = collectionDef;
        
        // Create collection if it doesn't exist
        if (!existingNames.includes(name)) {
          await db.createCollection(name);
          console.log(`[REACHX - Database Manager] Created collection: ${name}`.green);
        } else {
          console.log(`[REACHX - Database Manager] Collection exists: ${name}`.blue);
        }
        
        // Create indexes
        if (indexes && indexes.length > 0) {
          const collection = db.collection(name);
          for (const indexDef of indexes) {
            try {
              await collection.createIndex(indexDef.key, {
                unique: indexDef.unique || false,
                background: true,
              });
            } catch (err: any) {
              // Ignore duplicate index errors
              if (!err.message?.includes("already exists")) {
                console.warn(`[REACHX - Database Manager] Index warning for ${name}: ${err.message}`.yellow);
              }
            }
          }
        }
      }
      
      // Seed initial data if defined
      const seedData = SEED_DATA[dbName as keyof typeof SEED_DATA];
      if (seedData) {
        for (const [collectionName, documents] of Object.entries(seedData)) {
          const collection = db.collection(collectionName);
          const count = await collection.countDocuments();
          
          if (count === 0) {
            await collection.insertMany(documents as any[]);
            console.log(`[REACHX - Database Manager] Seeded ${documents.length} document(s) into ${collectionName}`.green);
          }
        }
      }
    }
    
    console.log("[REACHX - Database Manager] All databases initialized successfully".green);
    
  } catch (error) {
    console.error("[REACHX - Database Manager] Failed to initialize databases:".red, error);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Check if databases exist and have required collections
 */
export async function checkDatabaseHealth(uri: string): Promise<{
  healthy: boolean;
  details: Record<string, { exists: boolean; collections: string[] }>;
}> {
  const client = new MongoClient(uri);
  const details: Record<string, { exists: boolean; collections: string[] }> = {};
  let healthy = true;
  
  try {
    await client.connect();
    
    for (const [dbName, schema] of Object.entries(DATABASE_SCHEMA)) {
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      const requiredCollections = schema.collections.map(c => c.name);
      const missingCollections = requiredCollections.filter(c => !collectionNames.includes(c));
      
      details[dbName] = {
        exists: collectionNames.length > 0,
        collections: collectionNames,
      };
      
      if (missingCollections.length > 0) {
        healthy = false;
        console.warn(`[REACHX - Database Manager] ${dbName} missing collections: ${missingCollections.join(", ")}`.yellow);
      }
    }
    
    return { healthy, details };
    
  } finally {
    await client.close();
  }
}

/**
 * Run initialization if this file is executed directly
 */
if (require.main === module) {
  const uri = process.env.DB_URI || "mongodb://localhost:27017/";
  
  initializeDatabases(uri)
    .then(() => {
      console.log("\n[REACHX - Database Manager] Initialization complete!".green);
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n[REACHX - Database Manager] Initialization failed:".red, error);
      process.exit(1);
    });
}
