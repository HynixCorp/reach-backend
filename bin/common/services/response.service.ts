import { Request, Response, NextFunction } from "express";
import { createErrorResponse } from "../utils";
import { logger } from "./logger.service";

/**
 * Centralized async error handler wrapper
 * Eliminates the need for try-catch blocks in every controller
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      logger.error("Controller", `${error.message}`);
      
      // Send error response
      res.status(500).json(
        createErrorResponse(
          `An error occurred while processing your request: ${error.message}`,
          500
        )
      );
    });
  };
}

/**
 * Response helper service to standardize controller responses
 */
export class ResponseHandler {
  /**
   * Send validation error response
   */
  static validationError(res: Response, errors: string[], statusCode: number = 400) {
    return res.status(statusCode).json(
      createErrorResponse(
        `Validation failed: ${errors.join(", ")}`,
        statusCode
      )
    );
  }
  
  /**
   * Send not found response
   */
  static notFound(res: Response, resource: string) {
    return res.status(404).json(
      createErrorResponse(
        `${resource} not found.`,
        404
      )
    );
  }
  
  /**
   * Send unauthorized response
   */
  static unauthorized(res: Response, message: string = "Access denied. Invalid or missing credentials.") {
    return res.status(403).json(
      createErrorResponse(message, 403)
    );
  }
  
  /**
   * Send conflict response (for duplicate resources)
   */
  static conflict(res: Response, message: string) {
    return res.status(409).json(
      createErrorResponse(message, 409)
    );
  }
  
  /**
   * Send bad request response
   */
  static badRequest(res: Response, message: string) {
    return res.status(400).json(
      createErrorResponse(message, 400)
    );
  }
  
  /**
   * Send forbidden response
   */
  static forbidden(res: Response, message: string = "Access forbidden.") {
    return res.status(403).json(
      createErrorResponse(message, 403)
    );
  }
  
  /**
   * Send internal server error
   */
  static serverError(res: Response, error: Error | string) {
    const message = error instanceof Error ? error.message : error;
    return res.status(500).json(
      createErrorResponse(
        `Internal server error: ${message}`,
        500
      )
    );
  }
}
