// storage.routes.ts
import express from "express";
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
router.post("/instances", instanceUploadFields, createInstanceHandler);
router.patch("/:instanceId", updateInstance);

// Version management
router.post("/:instanceId/versions", instanceUploadFields, uploadNewVersion);
router.get("/:instanceId/versions", getInstanceVersions);
router.patch("/:instanceId/versions/:versionHash/assets", instanceUploadFields, updateVersionAssets);
router.patch("/:instanceId/versions/:versionHash/activate", activateVersion);
router.patch("/:instanceId/versions/:versionHash/approve", approveVersion);

// Version inspection
router.get("/:instanceId/versions/:versionHash/files", browseVersionFiles);
router.get("/:instanceId/versions/:hashA/compare/:hashB", compareVersions);

// Client endpoints
router.get("/:instanceId/check-update", checkForUpdate);
router.get("/:instanceId/manifest", createManifestSignature);
router.get("/:instanceId/checksum", createPackageChecksum);

// Logs
router.get("/:instanceId/logs", getInstanceLogs);

export default router;