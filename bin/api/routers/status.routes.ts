import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import {
  getFullStatus,
  getSimpleHealth,
  getReadiness,
  getLiveness,
  getDatabasesStatus,
  getServicesStatus,
  getSystemStatus,
  getProcessStatus,
  getRecentLogs,
  getLogsByDate,
  getStatusSummary,
} from "../controllers/status.controller";

const ROUTER = express.Router();

/**
 * Status Routes for status.reachx.dev
 * 
 * Provides comprehensive health monitoring for the backend
 */

// Full health report
ROUTER.get("/", asyncHandler(getFullStatus));

// Simple health check (for load balancers)
ROUTER.get("/health", asyncHandler(getSimpleHealth));

// Kubernetes probes
ROUTER.get("/ready", asyncHandler(getReadiness));
ROUTER.get("/live", asyncHandler(async (req, res) => getLiveness(req, res)));

// Component-specific status
ROUTER.get("/databases", asyncHandler(getDatabasesStatus));
ROUTER.get("/services", asyncHandler(getServicesStatus));
ROUTER.get("/system", asyncHandler(async (req, res) => getSystemStatus(req, res)));
ROUTER.get("/process", asyncHandler(async (req, res) => getProcessStatus(req, res)));

// Logs endpoints
ROUTER.get("/logs", asyncHandler(getRecentLogs));
ROUTER.get("/logs/:date", asyncHandler(getLogsByDate));

// Quick summary for dashboards
ROUTER.get("/summary", asyncHandler(getStatusSummary));

export { ROUTER as STATUS_ROUTER };
export default ROUTER;
