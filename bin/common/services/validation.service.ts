import { Request } from "express";
import { ObjectId } from "mongodb";

/**
 * Validation service to consolidate common validation patterns
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate required fields in request body
 */
export function validateRequiredFields(
  body: Record<string, any>,
  requiredFields: string[]
): ValidationResult {
  const errors: string[] = [];
  
  for (const field of requiredFields) {
    if (!body[field] || body[field] === "" || body[field] === null || body[field] === undefined) {
      errors.push(`Field '${field}' is required`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate required headers
 */
export function validateRequiredHeaders(
  headers: Record<string, any>,
  requiredHeaders: string[]
): ValidationResult {
  const errors: string[] = [];
  
  for (const header of requiredHeaders) {
    if (!headers[header] || headers[header] === "" || (Array.isArray(headers[header]) && headers[header].length === 0)) {
      errors.push(`Header '${header}' is required`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate required query parameters
 */
export function validateRequiredQuery(
  query: Record<string, any>,
  requiredParams: string[]
): ValidationResult {
  const errors: string[] = [];
  
  for (const param of requiredParams) {
    if (!query[param] || query[param] === "" || query[param] === null || query[param] === undefined) {
      errors.push(`Query parameter '${param}' is required`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate MongoDB ObjectId
 */
export function isValidObjectId(id: string): boolean {
  const hex24 = /^[0-9a-fA-F]{24}$/;
  return hex24.test(id);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate token format (non-empty string)
 */
export function isValidToken(token: string | string[] | undefined): boolean {
  return typeof token === "string" && token.length > 0;
}

/**
 * Validate array is not empty
 */
export function isNonEmptyArray(arr: any): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * Sanitize string input (remove potentially dangerous characters)
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, ''); // Remove quotes
}

/**
 * Validate and extract authorization token from headers
 */
export function extractAuthToken(req: Request, headerName: string = 'x-reach-token'): string | null {
  const token = req.headers[headerName];
  
  if (!token || (Array.isArray(token) && token.length === 0)) {
    return null;
  }
  
  return Array.isArray(token) ? token[0] : token;
}

/**
 * Generic validation for common request patterns
 */
export function validateRequest(
  req: Request,
  options: {
    requiredBody?: string[];
    requiredHeaders?: string[];
    requiredQuery?: string[];
    requiredParams?: string[];
  }
): ValidationResult {
  const errors: string[] = [];
  
  if (options.requiredBody) {
    const bodyValidation = validateRequiredFields(req.body, options.requiredBody);
    if (!bodyValidation.isValid) {
      errors.push(...bodyValidation.errors);
    }
  }
  
  if (options.requiredHeaders) {
    const headersValidation = validateRequiredHeaders(req.headers as Record<string, any>, options.requiredHeaders);
    if (!headersValidation.isValid) {
      errors.push(...headersValidation.errors);
    }
  }
  
  if (options.requiredQuery) {
    const queryValidation = validateRequiredQuery(req.query as Record<string, any>, options.requiredQuery);
    if (!queryValidation.isValid) {
      errors.push(...queryValidation.errors);
    }
  }
  
  if (options.requiredParams) {
    const paramsValidation = validateRequiredQuery(req.params as Record<string, any>, options.requiredParams);
    if (!paramsValidation.isValid) {
      errors.push(...paramsValidation.errors);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
