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

const router = express.Router();

// Instance CRUD
router.post("/instances", instanceUploadFields, asyncHandler(createInstanceHandler));
router.patch("/:instanceId", asyncHandler(updateInstance));

// Version management
router.post("/:instanceId/versions", instanceUploadFields, asyncHandler(uploadNewVersion));
router.get("/:instanceId/versions", asyncHandler(getInstanceVersions));
router.patch("/:instanceId/versions/:versionHash/assets", instanceUploadFields, asyncHandler(updateVersionAssets));
router.patch("/:instanceId/versions/:versionHash/activate", asyncHandler(activateVersion));
router.patch("/:instanceId/versions/:versionHash/approve", asyncHandler(approveVersion));

// Version inspection
router.get("/:instanceId/versions/:versionHash/files", asyncHandler(browseVersionFiles));
router.get("/:instanceId/versions/:hashA/compare/:hashB", asyncHandler(compareVersions));

// Client endpoints
router.get("/:instanceId/check-update", asyncHandler(checkForUpdate));
router.get("/:instanceId/manifest", asyncHandler(createManifestSignature));
router.get("/:instanceId/checksum", asyncHandler(createPackageChecksum));

// Logs
router.get("/:instanceId/logs", asyncHandler(getInstanceLogs));

export default router;