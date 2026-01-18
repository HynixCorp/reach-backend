// storage.routes.ts
import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import { 
  createInstanceHandler, 
  createManifestSignature, 
  createPackageChecksum,
  uploadNewVersion,
  getInstanceVersions,
  checkForUpdate,
  updateVersionAssets,
  activateVersion,
  browseVersionFiles,
  compareVersions,
  getInstanceLogs,
  updateInstance,
  approveVersion
} from "../controllers/storage.controller";
import { instanceUploadFields } from "../../common/multer/multer.instances";
import { API_ROUTES } from "../../common/constants";

const router = express.Router();

/**
 * Cloud Storage Routes
 * 
 * Handles instance file management, versioning, and uploads.
 * Used by dashboard for managing experience packages.
 */

// Instance CRUD
router.post(API_ROUTES.CLOUD.CREATE_INSTANCE, instanceUploadFields, asyncHandler(createInstanceHandler));
router.patch(API_ROUTES.CLOUD.UPDATE_INSTANCE, asyncHandler(updateInstance));

// Version management
router.post(API_ROUTES.CLOUD.CREATE_VERSION, instanceUploadFields, asyncHandler(uploadNewVersion));
router.get(API_ROUTES.CLOUD.GET_VERSIONS, asyncHandler(getInstanceVersions));
router.patch(API_ROUTES.CLOUD.UPDATE_VERSION_ASSETS, instanceUploadFields, asyncHandler(updateVersionAssets));
router.patch(API_ROUTES.CLOUD.ACTIVATE_VERSION, asyncHandler(activateVersion));
router.patch(API_ROUTES.CLOUD.APPROVE_VERSION, asyncHandler(approveVersion));

// Version inspection
router.get(API_ROUTES.CLOUD.BROWSE_VERSION_FILES, asyncHandler(browseVersionFiles));
router.get(API_ROUTES.CLOUD.COMPARE_VERSIONS, asyncHandler(compareVersions));

// Client endpoints (launcher)
router.get(API_ROUTES.CLOUD.CHECK_UPDATE, asyncHandler(checkForUpdate));
router.get(API_ROUTES.CLOUD.MANIFEST, asyncHandler(createManifestSignature));
router.get(API_ROUTES.CLOUD.CHECKSUM, asyncHandler(createPackageChecksum));

// Logs
router.get(API_ROUTES.CLOUD.LOGS, asyncHandler(getInstanceLogs));

export default router;