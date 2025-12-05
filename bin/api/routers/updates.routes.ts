import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { multerDirSafe } from "../../common/utils";
import { asyncHandler } from "../../common/services/response.service";

import {
    checkForUpdates,
    getLatestVersion,
    publishUpdate,
    uploadUpdateFile,
    uploadUpdateFiles,
    getVersionHistory,
    deleteVersion,
    purgeUpdates
} from "../controllers/updates.controller";

const ROUTER = express.Router();

// Multer config for update file uploads
const updateStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tmp = path.join(multerDirSafe(), "temp");
        fs.ensureDirSync(tmp);
        cb(null, tmp);
    },
    filename: (req, file, cb) => {
        // Keep original filename for update files
        cb(null, file.originalname);
    }
});

const updateUpload = multer({ 
    storage: updateStorage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit per file
});

// ============================================
// PUBLIC ENDPOINTS (for Tauri updater)
// ============================================

// Check for updates - Tauri updater endpoint
// GET /api/updates/v0/:platform/:arch/:current_version
ROUTER.get("/:platform/:arch/:current_version", asyncHandler(checkForUpdates));

// Get latest version info for all platforms
// GET /api/updates/v0/latest
ROUTER.get("/latest", asyncHandler(getLatestVersion));

// Get version history
// GET /api/updates/v0/history
ROUTER.get("/history", asyncHandler(getVersionHistory));

// ============================================
// PROTECTED ENDPOINTS (for GitHub Actions)
// Require x-update-secret header
// ============================================

// Publish update manifest
// POST /api/updates/v0/publish
ROUTER.post("/publish", asyncHandler(publishUpdate));

// Upload single update file for a platform
// POST /api/updates/v0/upload/:platform
ROUTER.post("/upload/:platform", updateUpload.single("file"), asyncHandler(uploadUpdateFile));

// Upload multiple update files at once
// POST /api/updates/v0/upload-batch
ROUTER.post("/upload-batch", updateUpload.array("files", 10), asyncHandler(uploadUpdateFiles));

// Delete a version
// DELETE /api/updates/v0/version/:version
ROUTER.delete("/version/:version", asyncHandler(deleteVersion));

// Purge all updates
// DELETE /api/updates/v0/purge
ROUTER.delete("/purge", asyncHandler(purgeUpdates));

export { ROUTER as UPDATES_ROUTER };
export default ROUTER;