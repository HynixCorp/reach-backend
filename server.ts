import "colorts/lib/string";
import express from "express";
import { createServer } from "node:http";
import dotenv from "dotenv";
import cors from "cors";
import bodyparser from "body-parser";

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
import path from "node:path";
import { reachCDNProtection } from "./bin/common/cdnMiddleware";

dotenv.config();

const PORT = process.env.PORT;
const app = express();

(async () => {
  const dbService = getDatabaseService();
  await dbService.connectAll();
  
  // Make database service available to controllers if needed
  app.locals.dbService = dbService;

  startInstanceManager();
  startTempCleaner();
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
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));

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

// Limit the size of incoming requests to 1gb
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ limit: "1gb", extended: true }));

// Create SocketIO server
const server = createServer(app);
const socketIOClient = new SocketIOClient(server);
setupListeners(socketIOClient);
socketIOClient.setup();
registerSocketClient(socketIOClient);

server
  .listen(PORT)
  .on("error", (error) => {
    throw new Error(error.message);
  });
