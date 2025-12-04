import { Request, Response } from "express";
import path from "path";
import fs from "fs-extra";
import { createSuccessResponse, createErrorResponse, multerDirSafe } from "../../common/utils";
import { validateRequest } from "../../common/services/validation.service";
import { ResponseHandler } from "../../common/services/response.service";

const CDN_DIR = path.join(multerDirSafe(), "updates");

// Ensure updates directory exists
fs.ensureDirSync(CDN_DIR);

/**
 * Interface for Tauri v2 update manifest
 */
interface TauriUpdateManifest {
    version: string;
    notes: string;
    pub_date: string;
    platforms: {
        [key: string]: {
            signature: string;
            url: string;
            filename?: string;
        };
    };
}

/**
 * Platform mappings for Tauri v2
 * Tauri uses: darwin-aarch64, darwin-x86_64, linux-x86_64, windows-x86_64, windows-aarch64
 */
const SUPPORTED_PLATFORMS = [
    "darwin-aarch64",
    "darwin-x86_64", 
    "linux-x86_64",
    "windows-x86_64",
    "windows-aarch64"
];

/**
 * GET /api/updates/v0/:platform/:arch/:current_version
 * Endpoint for Tauri updater to check for updates
 * Returns update info if a newer version is available
 */
export async function checkForUpdates(req: Request, res: Response) {
    try {
        const { platform, arch, current_version } = req.params;
        const platformKey = `${platform}-${arch}`;

        const latestPath = path.join(CDN_DIR, "latest.json");
        
        if (!await fs.pathExists(latestPath)) {
            return res.status(404).json(createErrorResponse("No updates available", 404));
        }

        const latestData: TauriUpdateManifest = await fs.readJson(latestPath);
        const platformData = latestData.platforms[platformKey];

        if (!platformData) {
            return res.status(404).json(createErrorResponse(`Platform ${platformKey} not supported`, 404));
        }

        // Compare versions - if current >= latest, no update needed
        if (compareVersions(current_version, latestData.version) >= 0) {
            return res.status(204).send(); // No Content = no update available
        }

        // Build the download URL
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const downloadUrl = platformData.url.startsWith("http") 
            ? platformData.url 
            : `${baseUrl}/cdn/updates/${platformData.filename || platformData.url}`;

        // Return Tauri v2 compatible response
        return res.json({
            version: latestData.version,
            notes: latestData.notes,
            pub_date: latestData.pub_date,
            platforms: {
                [platformKey]: {
                    signature: platformData.signature,
                    url: downloadUrl
                }
            }
        });
    } catch (error) {
        console.error("[REACH - Updates] Error checking for updates:".red, error);
        return res.status(500).json(createErrorResponse("Internal server error", 500));
    }
}

/**
 * GET /api/updates/v0/latest
 * Get the latest version info for all platforms
 */
export async function getLatestVersion(req: Request, res: Response) {
    try {
        const latestPath = path.join(CDN_DIR, "latest.json");
        
        if (!await fs.pathExists(latestPath)) {
            return res.status(404).json(createErrorResponse("No updates available", 404));
        }

        const latestData: TauriUpdateManifest = await fs.readJson(latestPath);
        const baseUrl = `${req.protocol}://${req.get("host")}`;

        // Transform URLs to absolute
        const platforms: TauriUpdateManifest["platforms"] = {};
        for (const [platform, data] of Object.entries(latestData.platforms)) {
            platforms[platform] = {
                signature: data.signature,
                url: data.url.startsWith("http") 
                    ? data.url 
                    : `${baseUrl}/cdn/updates/${data.filename || data.url}`
            };
        }

        return res.json({
            version: latestData.version,
            notes: latestData.notes,
            pub_date: latestData.pub_date,
            platforms
        });
    } catch (error) {
        console.error("[REACH - Updates] Error getting latest version:".red, error);
        return res.status(500).json(createErrorResponse("Internal server error", 500));
    }
}

/**
 * POST /api/updates/v0/publish
 * Endpoint for GitHub Actions to publish a new update
 * Requires x-update-secret header for authentication
 */
export async function publishUpdate(req: Request, res: Response) {
    try {
        // Validate secret token
        const updateSecret = req.headers["x-update-secret"];
        if (!updateSecret || updateSecret !== process.env.UPDATE_SECRET) {
            return res.status(401).json(createErrorResponse("Unauthorized", 401));
        }

        const validation = validateRequest(req, {
            requiredBody: ["version", "notes", "platforms"]
        });

        if (!validation.isValid) {
            return ResponseHandler.validationError(res, validation.errors);
        }

        const { version, notes, platforms } = req.body;

        // Validate platforms object
        if (typeof platforms !== "object" || Object.keys(platforms).length === 0) {
            return res.status(400).json(createErrorResponse("At least one platform is required", 400));
        }

        // Validate each platform has required fields
        for (const [platform, data] of Object.entries(platforms)) {
            if (!SUPPORTED_PLATFORMS.includes(platform)) {
                return res.status(400).json(createErrorResponse(`Unsupported platform: ${platform}`, 400));
            }
            
            const platformData = data as any;
            if (!platformData.signature) {
                return res.status(400).json(createErrorResponse(`Missing signature for platform: ${platform}`, 400));
            }
            if (!platformData.filename && !platformData.url) {
                return res.status(400).json(createErrorResponse(`Missing filename or url for platform: ${platform}`, 400));
            }
        }

        const manifest: TauriUpdateManifest = {
            version,
            notes,
            pub_date: new Date().toISOString(),
            platforms
        };

        // Save the manifest
        await fs.writeJson(path.join(CDN_DIR, "latest.json"), manifest, { spaces: 2 });

        // Archive old manifests for history
        const archiveDir = path.join(CDN_DIR, "archive");
        await fs.ensureDir(archiveDir);
        await fs.writeJson(path.join(archiveDir, `${version}.json`), manifest, { spaces: 2 });

        console.log(`[REACH - Updates] Published update v${version}`.green);

        return res.json(createSuccessResponse({ version, platforms: Object.keys(platforms) }, "Update published successfully"));
    } catch (error) {
        console.error("[REACH - Updates] Error publishing update:".red, error);
        return res.status(500).json(createErrorResponse("Internal server error", 500));
    }
}

/**
 * POST /api/updates/v0/upload/:platform
 * Upload update file for a specific platform
 * Expects multipart form with 'file' and 'signature' fields
 */
export async function uploadUpdateFile(req: Request, res: Response) {
    try {
        // Validate secret token
        const updateSecret = req.headers["x-update-secret"];
        if (!updateSecret || updateSecret !== process.env.UPDATE_SECRET) {
            return res.status(401).json(createErrorResponse("Unauthorized", 401));
        }

        const { platform } = req.params;
        
        if (!SUPPORTED_PLATFORMS.includes(platform)) {
            return res.status(400).json(createErrorResponse(`Unsupported platform: ${platform}`, 400));
        }

        const file = req.file;
        if (!file) {
            return res.status(400).json(createErrorResponse("No file uploaded", 400));
        }

        // Move file from temp to updates directory with proper name
        const filename = file.originalname;
        const destPath = path.join(CDN_DIR, filename);
        
        await fs.move(file.path, destPath, { overwrite: true });

        console.log(`[REACH - Updates] Uploaded file: ${filename} for platform: ${platform}`.green);

        return res.json(createSuccessResponse({ 
            filename,
            platform,
            path: `/cdn/updates/${filename}`
        }, "File uploaded successfully"));
    } catch (error) {
        console.error("[REACH - Updates] Error uploading file:".red, error);
        return res.status(500).json(createErrorResponse("Internal server error", 500));
    }
}

/**
 * POST /api/updates/v0/upload-batch
 * Upload multiple update files at once (for GitHub Actions)
 * Expects multipart form with multiple 'files' 
 */
export async function uploadUpdateFiles(req: Request, res: Response) {
    try {
        // Validate secret token
        const updateSecret = req.headers["x-update-secret"];
        if (!updateSecret || updateSecret !== process.env.UPDATE_SECRET) {
            return res.status(401).json(createErrorResponse("Unauthorized", 401));
        }

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json(createErrorResponse("No files uploaded", 400));
        }

        const uploaded: string[] = [];
        for (const file of files) {
            const filename = file.originalname;
            const destPath = path.join(CDN_DIR, filename);
            await fs.move(file.path, destPath, { overwrite: true });
            uploaded.push(filename);
        }

        console.log(`[REACH - Updates] Batch uploaded ${uploaded.length} files`.green);

        return res.json(createSuccessResponse({ 
            files: uploaded,
            count: uploaded.length
        }, "Files uploaded successfully"));
    } catch (error) {
        console.error("[REACH - Updates] Error batch uploading files:".red, error);
        return res.status(500).json(createErrorResponse("Internal server error", 500));
    }
}

/**
 * GET /api/updates/v0/history
 * Get version history
 */
export async function getVersionHistory(req: Request, res: Response) {
    try {
        const archiveDir = path.join(CDN_DIR, "archive");
        
        if (!await fs.pathExists(archiveDir)) {
            return res.json(createSuccessResponse({ versions: [] }, "No version history"));
        }

        const files = await fs.readdir(archiveDir);
        const versions = files
            .filter(f => f.endsWith(".json"))
            .map(f => f.replace(".json", ""))
            .sort((a, b) => compareVersions(b, a)); // Sort descending

        return res.json(createSuccessResponse({ versions }, "Version history retrieved"));
    } catch (error) {
        console.error("[REACH - Updates] Error getting version history:".red, error);
        return res.status(500).json(createErrorResponse("Internal server error", 500));
    }
}

/**
 * DELETE /api/updates/v0/version/:version
 * Delete a specific version (admin only)
 */
export async function deleteVersion(req: Request, res: Response) {
    try {
        const updateSecret = req.headers["x-update-secret"];
        if (!updateSecret || updateSecret !== process.env.UPDATE_SECRET) {
            return res.status(401).json(createErrorResponse("Unauthorized", 401));
        }

        const { version } = req.params;
        const archivePath = path.join(CDN_DIR, "archive", `${version}.json`);
        
        if (!await fs.pathExists(archivePath)) {
            return res.status(404).json(createErrorResponse("Version not found", 404));
        }

        await fs.remove(archivePath);
        console.log(`[REACH - Updates] Deleted version: ${version}`.yellow);

        return res.json(createSuccessResponse({ version }, "Version deleted"));
    } catch (error) {
        console.error("[REACH - Updates] Error deleting version:".red, error);
        return res.status(500).json(createErrorResponse("Internal server error", 500));
    }
}

/**
 * Compare semantic versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
    // Remove 'v' prefix if present
    const cleanA = a.replace(/^v/, "");
    const cleanB = b.replace(/^v/, "");
    
    const partsA = cleanA.split(".").map(Number);
    const partsB = cleanB.split(".").map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        
        if (numA < numB) return -1;
        if (numA > numB) return 1;
    }
    
    return 0;
}

// Legacy export for backwards compatibility
export { checkForUpdates as createLatestFile };