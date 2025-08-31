import 'colorts/lib/string';
import express, { Request, Response } from "express";
import { createServer } from 'node:http';
import dotenv from "dotenv";
import cors from 'cors';
import bodyparser from 'body-parser';
import { Server } from "socket.io";
import { reachCondor, reachCondorErrorHandler, reachEmptyBodyHandler, reachUserAgentMiddleware } from "./bin/common/middleware";
import { API_ROUTER } from './bin/models/router';
import { multerDirSafe, assetsDirSafe } from './bin/common/utils';
import { startInstanceManager } from './bin/tasks/instanceManager';

dotenv.config();

const PORT = process.env.PORT;
const app = express();

startInstanceManager();

app.use(cors());
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use('/cdn', express.static(multerDirSafe()));
app.use('/assets', express.static(assetsDirSafe()));

// Limit the size of incoming requests to 1gb
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true }));

// Middleware to handle specific request patterns and errors
app.use(reachCondor);
app.use(reachCondorErrorHandler);
app.use(reachEmptyBodyHandler);
app.use(reachUserAgentMiddleware);
app.use(API_ROUTER);

const server = createServer(app);
const io = new Server(server);

server.listen(PORT, () => {
    console.log(`[REACH - Express] Server is running on port ${PORT}`.green);
}).on("error", (error) => {
    throw new Error(error.message);
});