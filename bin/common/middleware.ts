import "colorts/lib/string";
import { NextFunction, Request, Response } from "express";
import { createErrorResponse } from "./utils";

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
        "%s",
        `[${DATE_REQ}] - ${METHOD_REQ} request with suspicious content detected: ${BODY_REQ}`
          .red
      );
      res
        .status(400)
        .json(
          createErrorResponse(
            "[REACH-SDK - Condor]: Suspicious content detected in request body."
          )
        );
      return;
    }
  }

  next();
}

function reachCondorErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(`[REACH-SDK - Condor]: An error occurred - ${err.message}`.red);
  res
    .status(500)
    .json(
      createErrorResponse(
        "[REACH-SDK - Condor]: An internal server error occurred."
      )
    );
}

function reachEmptyBodyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === "POST") {
    const contentType = req.headers["content-type"];

    if (contentType && contentType.includes("multipart/form-data")) {
      // Multer manejará esto, no lo revisamos aquí
      return next();
    }

    if (req.body === undefined || req.body === null) {
      res
        .status(400)
        .json(
          createErrorResponse(
            "[REACH-SDK - Condor]: Request body cannot be empty."
          )
        );
      return;
    }

    if (Object.keys(req.body).length === 0) {
      console.warn(
        `[REACH-SDK - Condor]: Empty request body detected at ${new Date().toLocaleString()}`
          .yellow
      );
      res
        .status(400)
        .json(
          createErrorResponse(
            "[REACH-SDK - Condor]: Request body cannot be empty."
          )
        );
    } else {
      next();
    }
  } else {
    next();
  }
}

function reachSDKHexaLauncherUserAgent(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.path.startsWith("/files/uploads")) {
    return next();
  }

  const userAgent = req.headers["user-agent"];
  if (userAgent && userAgent.includes("HexaLauncher/1.0")) {
    next();
  } else {
    res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH-SDK - HexaLauncher]: Unsupported User-Agent."
        )
      );
  }
}

export {
  reachCondor,
  reachCondorErrorHandler,
  reachEmptyBodyHandler,
  reachSDKHexaLauncherUserAgent,
};
