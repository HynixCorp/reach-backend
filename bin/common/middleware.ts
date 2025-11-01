import "colorts/lib/string";
import { NextFunction, Request, Response } from "express";
import { createErrorResponse } from "./utils";

/* =========================
   🪶 REACH CONDOR CORE
========================= */
function reachCondor(req: Request, res: Response, next: NextFunction): void {
  const METHOD_REQ = req.method;
  const DATE_REQ = new Date().toLocaleString();
  const BODY_REQ = JSON.stringify(req.body);

  const patternsSuspicions = [
    /select\s+\*/i,
    /union\s+select/i,
    /insert\s+into/i,
    /delete\s+from/i,
    /drop\s+table/i,
    /update\s+.+\s+set/i,
    /exec\s*\(/i,
    /execute\s*\(/i,
  ];

  for (const pattern of patternsSuspicions) {
    if (pattern.test(BODY_REQ)) {
      console.log(
        `%s`,
        `[${DATE_REQ}] - ${METHOD_REQ} request with suspicious content detected: ${BODY_REQ}`.red
      );
      res
        .status(400)
        .json(
          createErrorResponse(
            "[REACH - Condor]: Suspicious content detected in request body."
          )
        );
      return;
    }
  }

  next();
}

/* =========================
   🧩 LOGGING MONITOR
========================= */
function reachLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime();
  const originalSend = res.send;

  res.send = function (body) {
    const diff = process.hrtime(start);
    const responseTime = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2) + "ms";
    const timestamp = new Date().toLocaleTimeString("es-MX", { hour12: false });

    // Colores dinámicos
    const methodColor =
      req.method === "GET"
        ? req.method.green
        : req.method === "POST"
        ? req.method.cyan
        : req.method === "DELETE"
        ? req.method.red
        : req.method.yellow;

    const statusColor =
      res.statusCode >= 500
        ? res.statusCode.toString().red
        : res.statusCode >= 400
        ? res.statusCode.toString().yellow
        : res.statusCode.toString().green;

    const resultPreview =
      typeof body === "string"
        ? body.slice(0, 20)
        : JSON.stringify(body).slice(0, 20);

    // Mostrar línea formateada
    console.log(
      `[${timestamp.gray}] ${statusColor} | ${responseTime.blue} | ${methodColor} | ${req.originalUrl.white} | ${resultPreview.dim}`
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
  console.error(
    `[REACH - Condor]: An error occurred - ${err.message.toUpperCase()}`.red
  );
  res
    .status(500)
    .json(
      createErrorResponse(
        "[REACH - Condor]: An internal server error occurred."
      )
    );
}

/* =========================
   🚨 EMPTY BODY HANDLER
========================= */
function reachEmptyBodyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.path.startsWith("/api/payments/v0")) return next();

  if (req.method === "POST") {
    const contentType = req.headers["content-type"];
    if (contentType?.includes("multipart/form-data")) return next();

    if (req.body === undefined || req.body === null) {
      res
        .status(400)
        .json(
          createErrorResponse("[REACH - Condor]: Request body cannot be empty.")
        );
      return;
    }

    if (Object.keys(req.body).length === 0) {
      console.warn(
        `[REACH - Condor]: Empty request body detected at ${new Date().toLocaleString()}`.yellow
      );
      res
        .status(400)
        .json(
          createErrorResponse("[REACH - Condor]: Request body cannot be empty.")
        );
    } else next();
  } else next();
}

/* =========================
   🧠 USER AGENT HANDLER
========================= */
function reachUserAgentMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.path.startsWith("/cdn") ||
    req.path.startsWith("/assets") ||
    req.path.startsWith("/api/payments/v0") ||
    req.path.startsWith("/api/cloud/v0")
  )
    return next();

  const userAgent = req.headers["user-agent"];
  if (userAgent?.includes("ReachXClient/1.0")) next();
  else {
    res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - UserAgent]: Unsupported User-Agent. Please use the correct."
        )
      );
  }
}

/* =========================
   📦 EXPORTS
========================= */
export {
  reachCondor,
  reachLogger,
  reachCondorErrorHandler,
  reachEmptyBodyHandler,
  reachUserAgentMiddleware,
};
