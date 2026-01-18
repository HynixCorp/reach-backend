/**
 * Metrics Middleware
 * 
 * Records request metrics for traffic analysis
 * Used by the admin dashboard
 */

import { Request, Response, NextFunction } from "express";
import { recordRequest } from "../services/metrics.service";

/**
 * Middleware to track request metrics
 * Records start time and captures response details
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Store original end function
  const originalEnd = res.end.bind(res);

  // Override end to capture metrics
  res.end = function (
    this: Response,
    chunk?: any,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ): Response {
    const responseTime = Date.now() - startTime;

    // Record the request
    recordRequest(req.method, req.path, res.statusCode, responseTime);

    // Call original end with proper argument handling
    if (typeof encodingOrCallback === "function") {
      return originalEnd(chunk, encodingOrCallback as () => void);
    }
    return originalEnd(chunk, encodingOrCallback as BufferEncoding, callback);
  };

  next();
}

export default metricsMiddleware;
