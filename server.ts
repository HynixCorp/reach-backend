import "colorts/lib/string";
import express from "express";
import { createServer } from "node:http";
import dotenv from "dotenv";
import cors from "cors";
import path from "node:path";

// Middleware imports
import {
  reachCondorErrorHandler,
  reachEmptyBodyHandler,
  reachUserAgentMiddleware,
  reachLogger,
} from "./bin/common/middleware";
import { metricsMiddleware } from "./bin/common/middlewares/metrics.middleware";

// Router import
import { API_ROUTER } from "./bin/models/router";

// Utility imports
import { multerDirSafe, assetsDirSafe } from "./bin/common/utils";

// Socket.IO imports
import { Client as SocketIOClient } from "./bin/common/socketio/client";
import { setupListeners } from "./bin/common/socketio/handleListeners";
import { registerSocketClient } from "./bin/common/socketio/bridge";

// Task imports
import { startInstanceManager } from "./bin/tasks/instanceManager";
import { startTempCleaner } from "./bin/tasks/tempCleaner";

// Service imports
import { getDatabaseService } from "./bin/common/services/database.service";
import { reachCDNProtection } from "./bin/common/cdnMiddleware";
import { health, rootInfo } from "./bin/api/controllers/athenas.controller";
import { asyncHandler } from "./bin/common/services/response.service";
import { logger } from "./bin/common/services/logger.service";
import { processManager } from "./bin/common/services/process.service";
import { healthService } from "./bin/common/services/health.service";

// Startup display imports
import {
  printBanner,
  printSystemInfo,
  printEnvCheck,
  printDatabaseStatus,
  printServiceStatus,
  printRoutes,
  printStartupSummary,
  printReady,
  printShutdown,
} from "./bin/common/services/startup.service";

// Constants
import { CDN_PATHS, RESOURCE_PATHS, API_ROUTES } from "./bin/common/constants";

dotenv.config();

// Print startup banner
printBanner();

// Print system info
const VERSION = process.env.npm_package_version || "1.0.0";
const ENVIRONMENT = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 3000;

printSystemInfo({
  serviceName: "Reach Backend",
  version: VERSION,
  environment: ENVIRONMENT,
  port: PORT,
});

// Check for critical environment variables
const requiredEnvVars = [
  "DB_URI",
  "CRYPTO_SECRET",
  "CDN_SECRET_KEY",
  "UPDATE_SECRET",
  "BETTER_AUTH_SECRET",
  "POLAR_API_KEY",
  "RESEND_API_KEY",
];

const envChecks = printEnvCheck(requiredEnvVars);

const app = express();

// Trust proxy (Traefik) for correct protocol/IP detection
app.set("trust proxy", 1);

// Health check and root endpoint (before any middleware)
app.get("/", asyncHandler(rootInfo));
app.get("/health", asyncHandler(health));

// Track all startup checks
const allChecks: { name: string; status: "ok" | "warning" | "error"; message?: string }[] = [...envChecks];

// Create HTTP server (will be started after process manager initializes)
const server = createServer(app);

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  printShutdown(signal);
  logger.info("Server", `Received ${signal}, starting graceful shutdown...`);
  
  // Stop health checks
  healthService.stopPeriodicHealthChecks();
  
  // Close server
  server.close(() => {
    logger.info("Server", "HTTP server closed.");
  });
  
  // Flush logs
  await logger.flush();
  
  // Give time for cleanup
  setTimeout(() => {
    logger.info("Server", "Shutdown complete.");
    process.exit(0);
  }, 5000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

(async () => {
  try {
    // Initialize process manager with pre-flight checks (lock file, port check, crash state)
    const processManagerReady = await processManager.initialize();
    if (!processManagerReady) {
      console.error("[REACHX - Server] Process manager initialization failed. Check logs for details.".red);
      console.error("[REACHX - Server] This usually means:".yellow);
      console.error("  - Another instance is already running".yellow);
      console.error("  - Port is in use by another service".yellow);
      console.error("  - Too many crashes in a short period".yellow);
      process.exit(1);
    }

    // Database connection
    const dbService = getDatabaseService();
    await dbService.connectAll();
    
    const dbChecks = printDatabaseStatus([
      { name: "reach_developers", connected: true },
      { name: "reach_players", connected: true },
      { name: "reach_experiences", connected: true },
      { name: "reach_overlay", connected: true },
    ]);
    allChecks.push(...dbChecks);
    
    // Initialize Better-Auth MongoDB connections
    const { initBetterAuthConnections } = await import("./bin/common/auth/better-auth.config");
    await initBetterAuthConnections();
    
    // Make database service available to controllers if needed
    app.locals.dbService = dbService;

    // Start background tasks
    startInstanceManager();
    startTempCleaner();
    
    // Start health monitoring
    healthService.startPeriodicHealthChecks(30000);
    
    // Print service status
    const serviceChecks = printServiceStatus([
      { name: "Database Service", status: "ok", message: "connected" },
      { name: "Better-Auth", status: "ok", message: "initialized" },
      { name: "Instance Manager (Cron)", status: "ok", message: "running" },
      { name: "Temp Cleaner (Cron)", status: "ok", message: "running" },
      { name: "Health Monitor", status: "ok", message: "active" },
      { name: "Process Manager", status: "ok", message: "ready" },
    ]);
    allChecks.push(...serviceChecks);
    
    // Print API routes
    printRoutes([
      "/api/auth/developer/v0 - Developer Authentication",
      "/api/auth/player/v0 - Player/Xbox Authentication",
      "/api/athenas/v0 - System & Health",
      "/api/instances/v0 - Instance Management",
      "/api/storage/v0 - Cloud Storage",
      "/api/marketplace/v0 - Marketplace",
      "/api/organizations/v0 - Organizations",
      "/api/payments/v0 - Payments & Webhooks",
      "/api/overlay/v0 - Overlay Service",
      "/api/updates/v0 - Update Service",
      "/api/status/v0 - Status & Monitoring",
      "/api/admin/v0 - Admin Panel (athenas.reachx.dev)",
    ]);
    
    // Print startup summary
    printStartupSummary(allChecks);
    
    logger.info("Server", "Initialization complete.");
    
    // Setup Socket.IO after all services are initialized
    const socketIOClient = new SocketIOClient(server);
    setupListeners(socketIOClient);
    socketIOClient.setup();
    registerSocketClient(socketIOClient);
    
    // Now start listening - AFTER process manager verified port is free
    server
      .listen(PORT, () => {
        printReady(PORT);
        
        // Mark successful startup after server is listening
        // This will clear crash state after 30 seconds of stable operation
        processManager.markSuccessfulStartup();
      })
      .on("error", (error) => {
        logger.fatal("Server", `Failed to start: ${error.message}`);
        // Don't throw - let process manager handle exit
        process.exit(1);
      });
      
  } catch (error) {
    const dbChecks = printDatabaseStatus([
      { name: "MongoDB", connected: false, error: String(error) },
    ]);
    allChecks.push(...dbChecks);
    printStartupSummary(allChecks);
    
    logger.fatal("Server", `Failed to initialize server: ${error}`);
    process.exit(1);
  }
})();


app.disable("x-powered-by");

app.use(
  cors({
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "User-Agent",
      "x-api-key",
    ],
    exposedHeaders: ["Content-Length"],
    credentials: true,
  })
);

// JSON and URL-encoded body parsing with size limits (1GB for large uploads)
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ limit: "1gb", extended: true }));

app.use(
  "/assets/resources",
  express.static(path.join(__dirname, "assets", "resources"))
);

// CDN Static Files Configuration
// Using constants from api.constants.ts

// Serve static update files from the 'cdn/updates' directory
app.use(
  CDN_PATHS.UPDATES,
  express.static(path.join(multerDirSafe(), "updates"))
);

// Serve static files from the 'cdn/instances/assets' directory
app.use(
  CDN_PATHS.INSTANCES_ASSETS,
  express.static(path.join(multerDirSafe(), "/instances/assets"))
);

// Serve static files from the 'cdn/instances/packages' directory with CDN protection middleware
app.use(
  CDN_PATHS.INSTANCES_PACKAGES,
  reachCDNProtection,
  express.static(path.join(multerDirSafe(), "/instances/packages"))
);

app.use(
  CDN_PATHS.INSTANCES_ARCHIVES,
  reachCDNProtection,
  express.static(path.join(multerDirSafe(), "/instances/experience-archives"))
);

app.use(
  CDN_PATHS.INSTANCES_FOLDERS,
  reachCDNProtection,
  express.static(path.join(multerDirSafe(), "/instances/experience-folders"))
);

// Middleware to handle specific request patterns and errors
app.use(metricsMiddleware); // Track request metrics for admin dashboard
app.use(reachLogger);
app.use(reachCondorErrorHandler);
app.use(reachEmptyBodyHandler);
app.use(reachUserAgentMiddleware);
app.use(API_ROUTER);
