import "colorts/lib/string";
import { NextFunction, Request, Response } from "express";
import { createErrorResponse } from "./utils";

/* =========================
   🧩 LOGGING MONITOR
========================= */
function reachLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime();
  const originalSend = res.send;

  res.send = function (body) {
    const diff = process.hrtime(start);
    const responseTime = `${(diff[0] * 1e3 + diff[1] / 1e6).toFixed(2)}ms`;
    const timestamp = new Date().toLocaleTimeString("es-MX", { hour12: false });

    const methodColors: Record<string, string> = {
      GET: req.method.green,
      POST: req.method.cyan,
      PUT: req.method.yellow,
      PATCH: req.method.magenta,
      DELETE: req.method.red,
    };

    const methodColor = methodColors[req.method] || req.method.yellow;
    const statusColor =
      res.statusCode >= 500
        ? res.statusCode.toString().red
        : res.statusCode >= 400
        ? res.statusCode.toString().yellow
        : res.statusCode.toString().green;

    let resultPreview = "Empty Body";
    if (body) {
      try {
        const parsedBody = JSON.parse(body);
        resultPreview = parsedBody.status?.toString() || parsedBody.message?.toString() || body.toString();
      } catch {
        resultPreview = body.toString();
      }
    }

    console.log(
      `[${timestamp.gray}] ${statusColor} | ${responseTime.blue} | ${methodColor} | ${req.originalUrl.white} | Body Code: ${resultPreview.dim}`
    );

    return originalSend.call(this, body);
  };

  next();
}

/* =========================
   🪶 ERROR HANDLER
========================= */
function reachCondorErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(`[REACH - Condor]: An error occurred - ${err.message.toUpperCase()}`.red);
  res.status(500).json(
    createErrorResponse("An internal server error occurred.", 500)
  );
}

/* =========================
   🚨 EMPTY BODY HANDLER
========================= */
const EMPTY_BODY_BYPASS_PATHS = ["/api/payments/v0"];

function reachEmptyBodyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip for non-POST requests
  if (req.method !== "POST") {
    return next();
  }

  // Skip for bypassed paths
  if (EMPTY_BODY_BYPASS_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  // Skip for multipart/form-data
  const contentType = req.headers["content-type"];
  if (contentType?.includes("multipart/form-data")) {
    return next();
  }

  // Check for empty body
  if (!req.body || Object.keys(req.body).length === 0) {
    console.warn(`[REACH - Condor]: Empty request body detected at ${new Date().toLocaleString()}`.yellow);
    res.status(400).json(createErrorResponse("Request body cannot be empty.", 400));
    return;
  }

  next();
}

/* =========================
   🧠 USER AGENT HANDLER
========================= */
const USER_AGENT_BYPASS_PATHS = [
  "/api/athenas/v0",
  "/api/updates/v0",
  "/api/payments/v0",
  "/api/cloud/v0",
  "/cdn",
  "/assets",
];

function reachUserAgentMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip for bypassed paths
  if (USER_AGENT_BYPASS_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  const userAgent = req.headers["user-agent"];
  
  if (!userAgent?.includes("ReachXClient/1.0")) {
    res.status(400).json(
      createErrorResponse("Unsupported User-Agent. Please use the correct one.", 400)
    );
    return;
  }

  next();
}

/* =========================
   📦 EXPORTS
========================= */
export {
  reachLogger,
  reachCondorErrorHandler,
  reachEmptyBodyHandler,
  reachUserAgentMiddleware,
};
