import "colorts/lib/string";
import express from "express";
import { createServer } from "node:http";
import dotenv from "dotenv";
import cors from "cors";
import path from "node:path";

import {
  reachCondorErrorHandler,
  reachEmptyBodyHandler,
  reachUserAgentMiddleware,
  reachLogger,
} from "./bin/common/middleware";

import { API_ROUTER } from "./bin/models/router";

import { multerDirSafe, assetsDirSafe } from "./bin/common/utils";

import { Client as SocketIOClient } from "./bin/common/socketio/client";
import { setupListeners } from "./bin/common/socketio/handleListeners";
import { registerSocketClient } from "./bin/common/socketio/bridge";

import { startInstanceManager } from "./bin/tasks/instanceManager";
import { startTempCleaner } from "./bin/tasks/tempCleaner";

import { getDatabaseService } from "./bin/common/services/database.service";
import { reachCDNProtection } from "./bin/common/cdnMiddleware";
import { health, rootInfo } from "./bin/api/controllers/athenas.controller";
import { asyncHandler } from "./bin/common/services/response.service";

dotenv.config();

// Check for critical environment variables
const requiredEnvVars = [
  "DB_URI",
  "CRYPTO_SECRET",
  "CDN_SECRET_KEY",
  "UPDATE_SECRET"
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.warn(
    `[REACH - Warning] Missing critical environment variables: ${missingEnvVars.join(
      ", "
    )}`.yellow
  );
  console.warn(
    `[REACH - Warning] Some features may not work correctly.`.yellow
  );
}

const PORT = process.env.PORT || 3000;
const app = express();

// Trust proxy (Traefik) for correct protocol/IP detection
app.set("trust proxy", 1);

// Health check and root endpoint (before any middleware)
app.get("/", asyncHandler(rootInfo));
app.get("/health", asyncHandler(health));

(async () => {
  const dbService = getDatabaseService();
  await dbService.connectAll();
  
  // Initialize Better-Auth MongoDB connections
  const { initBetterAuthConnections } = await import("./bin/common/auth/better-auth.config");
  await initBetterAuthConnections();
  
  // Make database service available to controllers if needed
  app.locals.dbService = dbService;

  startInstanceManager();
  startTempCleaner();
  
  console.log("[REACH - Server] Database connected and tasks started".green);
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
)

// Serve static update files from the 'cdn/updates' directory
app.use(
  "/cdn/updates",
  express.static(path.join(multerDirSafe(), "updates"))
);

// Serve static files from the 'cdn/instances/assets' directory
app.use(
  "/cdn/instances/assets",
  express.static(path.join(multerDirSafe(), "/instances/assets"))
);

// Serve static files from the 'cdn/instances/packages' directory with CDN protection middleware
app.use(
  "/cdn/instances/packages",
  reachCDNProtection,
  express.static(path.join(multerDirSafe(), "/instances/packages"))
);

app.use(
  "/cdn/instances/experience-archives",
  reachCDNProtection,
  express.static(path.join(multerDirSafe(), "/instances/experience-archives"))
);

app.use(
  "/cdn/instances/experience-folders",
  reachCDNProtection,
  express.static(path.join(multerDirSafe(), "/instances/experience-folders"))
);

// Middleware to handle specific request patterns and errors
app.use(reachLogger);
app.use(reachCondorErrorHandler);
app.use(reachEmptyBodyHandler);
app.use(reachUserAgentMiddleware);
app.use(API_ROUTER);

// Create SocketIO server
const server = createServer(app);
const socketIOClient = new SocketIOClient(server);
setupListeners(socketIOClient);
socketIOClient.setup();
registerSocketClient(socketIOClient);

server
  .listen(PORT, () => {
    console.log(`[REACH - Server] Server running on port ${PORT}`.green);
    console.log(`[REACH - Server] Environment: ${process.env.NODE_ENV || 'development'}`.blue);
  })
  .on("error", (error) => {
    console.error(`[REACH - Server] Failed to start: ${error.message}`.red);
    throw new Error(error.message);
  });
