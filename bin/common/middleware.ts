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

    // Para la vista tomar la respuesta del body, intentar parsearla si es JSON y tomar la clave status o message
    let resultPreview = "";
    try {
      const parsedBody = JSON.parse(body);
      resultPreview = parsedBody.status
        ? parsedBody.status.toString()
        : parsedBody.message
        ? parsedBody.message.toString()
        : body.toString();
    } catch {
      resultPreview = body.toString();
    }

    // Mostrar línea formateada
    console.log(
      `[${timestamp.gray}] ${statusColor} | ${responseTime.blue} | ${methodColor} | ${req.originalUrl.white} | Response Code: ${resultPreview.dim}`
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
    req.path.startsWith("/api/athenas/v0") ||
    req.path.startsWith("/api/updates/v0") ||
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
          "[REACH - UserAgent]: Unsupported User-Agent. Please use the correct one."
        )
      );
  }
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
