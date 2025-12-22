import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import { nanoid } from "nanoid";
import extract from "extract-zip";
import { Request, Response } from "express";
import { multerDirSafe } from "../../common/utils";
import { ReachC } from "../../common/cryptography/reachCrypto";
import { socketClient } from "../../common/socketio/bridge";
import { usageToken } from "../../common/reach/usage";
import { getOrganizationIdFromBID } from "../../common/reach/orgs.provider";
import { generateSignedUrl } from "../../common/cdnMiddleware";
import { getExperiencesDB, getDevelopersDB } from "../../common/services/database.service";
import { ResponseHandler } from "../../common/services/response.service";
import { validateRequest } from "../../common/services/validation.service";
import { InstanceVersion, PlanType, VERSION_LIMITS, InstanceLog, FileDiffResult } from "../../types/versions";

// ============================================================================
// CONSTANTS
// ============================================================================

const CDN_PACKAGE_FOLDER_ROOT = "instances/experience-folders";
const CDN_PACKAGE_ARCHIVE_ROOT = "instances/experience-archives";
const LEGACY_CDN_PACKAGE_ROOT = "instances/packages";
const PACKAGE_SIGNED_URL_TTL = 300;

const KNOWN_PACKAGE_ROOTS = [
  CDN_PACKAGE_FOLDER_ROOT,
  CDN_PACKAGE_ARCHIVE_ROOT,
  LEGACY_CDN_PACKAGE_ROOT,
];

// ============================================================================
// TYPES
// ============================================================================

type OrganizationMemberEntry = string | { userId?: string; role?: string };

interface InstanceContext {
  instance: any;
  organization: any;
  subscriptionOwnerId: string;
  requestedById: string;
  hasPermission: boolean;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function isOrganizationMember(members: unknown, userId: string): boolean {
  if (!userId || !Array.isArray(members)) return false;

  return members.some((member) => {
    if (typeof member === "string") return member === userId;
    if (member && typeof member === "object") {
      const candidate = member as { userId?: unknown };
      return typeof candidate.userId === "string" && candidate.userId === userId;
    }
    return false;
  });
}

function buildPackageKey(root: string, ...segments: Array<string | undefined | null>): string {
  const sanitized = segments
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));

  return [root, ...sanitized].filter(Boolean).join("/").replace(/\/{2,}/g, "/");
}

const buildPackageFolderKey = (...segments: Array<string | undefined | null>) =>
  buildPackageKey(CDN_PACKAGE_FOLDER_ROOT, ...segments);

const buildPackageArchiveKey = (...segments: Array<string | undefined | null>) =>
  buildPackageKey(CDN_PACKAGE_ARCHIVE_ROOT, ...segments);

function normalizePackageKey(value?: string | null): string | null {
  if (!value?.trim()) return null;

  let normalized = value.trim().replace(/\\/g, "/");
  if (normalized.startsWith("/cdn")) normalized = normalized.substring(4);
  normalized = normalized.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!normalized) return null;

  // Check known roots
  for (const root of KNOWN_PACKAGE_ROOTS) {
    if (normalized === root || normalized.startsWith(`${root}/`)) return normalized;
  }

  // Legacy packages path
  if (normalized.startsWith("packages/")) {
    return `${LEGACY_CDN_PACKAGE_ROOT}/${normalized.substring(9).replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
  }

  // Already prefixed with instances/
  if (normalized.startsWith("instances/")) return normalized;

  return buildPackageFolderKey(normalized);
}

const toPublicCdnPathFromKey = (value?: string | null): string | null => {
  const key = normalizePackageKey(value);
  return key ? `/cdn/${key}`.replace(/\/{2,}/g, "/") : null;
};

const toSignedCdnUrlFromKey = (value?: string | null, ttl = PACKAGE_SIGNED_URL_TTL): string | null => {
  const key = normalizePackageKey(value);
  return key ? generateSignedUrl(`/${key}`, ttl) : null;
};

function emitProgress(instanceId: string, step: string, payload?: any) {
  const io = socketClient?.getIO?.();
  if (io) {
    io.emit("instance-progress", { instanceId, step, ...payload });
  }
}

const generateVersionHash = () => crypto.randomBytes(16).toString("hex");

async function getPlanType(organizationId: string): Promise<PlanType> {
  try {
    // Using DEVELOPERS_DB for organizations
    const orgs = await getDevelopersDB().findDocuments("organizations", {
      _id: getDevelopersDB().createObjectId(organizationId),
    });
    const plan = orgs?.[0]?.plan?.toLowerCase();
    if (plan === "standard" || plan === "pro") return plan;
  } catch {
    console.warn("Could not fetch organization plan, defaulting to hobby");
  }
  return "hobby";
}

/**
 * Validates instance access and returns context for handlers
 */
async function getInstanceContext(
  instanceId: string,
  requestedById: string
): Promise<{ success: true; context: InstanceContext } | { success: false; error: string; status: number }> {
  const db = getExperiencesDB();
  // Using DEVELOPERS_DB for organizations

  const instances = await db.findDocuments("instances", { id: instanceId });
  if (!instances?.length) {
    return { success: false, error: "Instance not found", status: 404 };
  }

  const instance = instances[0];
  const orgId = getDevelopersDB().createObjectId(instance.organizationId);
  const organizations = await getDevelopersDB().findDocuments("organizations", { _id: orgId });

  if (!organizations?.length) {
    return { success: false, error: "Organization not found", status: 404 };
  }

  const organization = organizations[0];
  const subscriptionOwnerId = organization.ownerId?.trim() || "";
  const hasPermission =
    !requestedById ||
    subscriptionOwnerId === requestedById ||
    isOrganizationMember(organization.members, requestedById);

  return {
    success: true,
    context: { instance, organization, subscriptionOwnerId, requestedById, hasPermission },
  };
}

/**
 * Gets active version and package folder path for an instance
 */
async function getActiveVersionPackage(
  instanceId: string,
  instance: any
): Promise<{ success: true; version: any; folderPath: string } | { success: false; error: string }> {
  const db = getExperiencesDB();
  const activeVersions = await db.findDocuments("instance_versions", { instanceId, active: true });

  if (!activeVersions?.length) {
    return { success: false, error: "No active version found for this instance" };
  }

  const version = activeVersions[0];
  const pkg = version.experiencePackage ?? {};

  let packageFolderKey =
    normalizePackageKey(pkg.packageFolder) ??
    normalizePackageKey(pkg.packageFolderKey) ??
    (instance.packageManifest ? normalizePackageKey(path.dirname(instance.packageManifest)) : null);

  if (!packageFolderKey) {
    return { success: false, error: "Package folder not configured for this instance" };
  }

  const folderPath = path.join(multerDirSafe(), packageFolderKey.replace(/^\/+/, ""));
  if (!(await fs.pathExists(folderPath))) {
    return { success: false, error: "Package folder not found" };
  }

  return { success: true, version, folderPath };
}

/** Parse mods array from body */
function parseModsArray(mods: any): any[] {
  if (!mods) return [];
  try {
    const parsed = typeof mods === "string" ? JSON.parse(mods) : mods;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Save uploaded asset files and return paths */
async function saveAssetFiles(
  files: any,
  assetsDir: string
): Promise<{ thumbnails: string[]; videos: string[] }> {
  const result = { thumbnails: [] as string[], videos: [] as string[] };
  await fs.ensureDir(assetsDir);

  if (files.assetsImages) {
    const arr = Array.isArray(files.assetsImages) ? files.assetsImages : [files.assetsImages];
    for (const file of arr) {
      const ext = path.extname(file.originalname);
      const newName = `${nanoid()}${ext}`;
      await fs.move(file.path, path.join(assetsDir, newName), { overwrite: true });
      result.thumbnails.push(`/cdn/instances/assets/${newName}`);
    }
  }

  if (files.assetsVideos) {
    const arr = Array.isArray(files.assetsVideos) ? files.assetsVideos : [files.assetsVideos];
    for (const file of arr) {
      const ext = path.extname(file.originalname);
      const newName = `${nanoid()}${ext}`;
      await fs.move(file.path, path.join(assetsDir, newName), { overwrite: true });
      result.videos.push(`/cdn/instances/assets/${newName}`);
    }
  }

  return result;
}

// ============================================================================
// EXPORTED HANDLERS
// ============================================================================

export async function createInstanceHandler(req: Request, res: Response) {
  /**
   * Expect multipart/form-data:
   * - fields per formSchema: name, status, provider, gameVersion, options[discordCustom], activitydc...
   * - files:
   *   - assetsImages[] (images)
   *   - assetsVideos[] (video)
   *   - experienceFile (zip) when provider === 'reach'
   */
  try {
    const db = getExperiencesDB();
    // Using DEVELOPERS_DB for organizations
    const body = req.body;
    const provider = body.provider;
    const requestedById =
      typeof body.ownerID === "string" ? body.ownerID.trim() : "";
    const organizationIdInput =
      typeof body.organizationId === "string"
        ? body.organizationId.trim()
        : "";
    const name = body.name;
    const status = body.status || "activepublic";
    const createdAt = new Date();
    const id = nanoid();

    let resolvedOrganizationId = organizationIdInput;

    if (!resolvedOrganizationId && requestedById) {
      try {
        resolvedOrganizationId = await getOrganizationIdFromBID(requestedById);
      } catch (error) {
        resolvedOrganizationId = "";
      }
    }

    if (!resolvedOrganizationId) {
      ResponseHandler.badRequest(
        res,
        "Organization selection is required to create an instance."
      );
      return;
    }

    let organization: any;
    try {
      const organizationObjectId = getDevelopersDB().createObjectId(
        resolvedOrganizationId
      );
      const organizations = await getDevelopersDB().findDocuments("organizations", {
        _id: organizationObjectId,
      });

      if (!organizations || organizations.length === 0) {
        ResponseHandler.notFound(res, "Organization");
        return;
      }

      organization = organizations[0];
    } catch (error) {
      ResponseHandler.badRequest(
        res,
        "Invalid organization identifier provided."
      );
      return;
    }

    const subscriptionOwnerId =
      typeof organization.ownerId === "string"
        ? organization.ownerId.trim()
        : "";

    if (!subscriptionOwnerId) {
      ResponseHandler.serverError(
        res,
        "Organization does not have a valid subscription owner."
      );
      return;
    }

    if (
      requestedById &&
      subscriptionOwnerId !== requestedById &&
      !isOrganizationMember(organization.members, requestedById)
    ) {
      ResponseHandler.forbidden(
        res,
        "The selected organization is not available for this user."
      );
      return;
    }

    const publisherId = organization._id.toString();

    const instanceId = id;
    const instanceFolderName = `${instanceId}_${name
      .replace(/\s+/g, "_")
      .toLowerCase()}`;

    const instancesRoot = path.join(multerDirSafe(), "instances");
    const assetsDir = path.join(instancesRoot, "assets");
    const packageFoldersDir = path.join(instancesRoot, "experience-folders");
    const packageArchivesDir = path.join(instancesRoot, "experience-archives");
    await fs.ensureDir(assetsDir);
    await fs.ensureDir(packageFoldersDir);
    await fs.ensureDir(packageArchivesDir);

    const documentExist = await db.findDocuments("instances", {
      name,
    });

    if (documentExist.length > 0) {
      emitProgress(instanceId, "Error", {
        message: "An instance with this name already exists.",
      });
      res.status(409).json({
        error: "An instance with this name already exists.",
        code: "DUPLICATE_INSTANCE_NAME",
      });
      return;
    }

    const versionHash = generateVersionHash();
    const versionNumber = 1;

    const doc: any = {
      id: instanceId,
      name,
      createdAt,
      updatedAt: createdAt,
      currentVersion: "1.0.0",
      provider,
      ownerID: subscriptionOwnerId,
      publisherId,
      organizationId: publisherId,
      subscriptionOwnerId,
      createdBy: requestedById || subscriptionOwnerId,
      activeVersionHash: versionHash,
      activeVersionNumber: versionNumber,
      totalVersions: 1,
      status,
      options: {
        discordCustom: body["options[discordCustom]"] === "true" || false,
      },
      application: {
        gameVersion: body.gameVersion,
        activitydc: body.activitydc,
        smallkeydc: body.smallkeydc,
        largekeydc: body.largekeydc,
      },
    };

    let manifestCreated: any = null;

    if (status === "activeprivate") {
      if (body.allowedUsersIDs) {
        doc.allowedUsersIDs = Array.isArray(body.allowedUsersIDs)
          ? body.allowedUsersIDs
          : String(body.allowedUsersIDs)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
      } else {
        doc.allowedUsersIDs = [];
      }
    }

    let type: "private" | "public" | "testing" | null;

    switch (status) {
      case "activepublic":
        type = "public";
        break;
      case "activeprivate":
        type = "private";
        break;
      case "testing":
        type = "testing";
        break;
      case "waiting":
        type = "public";
        break;
      default:
        type = null;
        break;
    }

    if (!type) {
      throw new Error(
        "Unsupported instance status provided; cannot determine token type."
      );
    }

    const consume = await usageToken(subscriptionOwnerId, type);

    if (!consume) {
      throw new Error(
        "It is not possible to consume a user token. Please try again later."
      );
    }

    // 1) Renaming Assets => move and rename uploaded assets (emit event)
    emitProgress(instanceId, "RenamingAssets", {
      message: "Starting assets rename",
    });

    const savedAssets: { thumbnails: string[]; videos: string[] } = {
      thumbnails: [],
      videos: [],
    };

    // files are in req.files (multer). support single or array names
    const files: any = req.files || {};
    // assetsImages
    if (files.assetsImages) {
      const arr = Array.isArray(files.assetsImages)
        ? files.assetsImages
        : [files.assetsImages];
      for (const file of arr) {
        const ext = path.extname(file.originalname);
        const newName = `${nanoid()}${ext}`;
        const dest = path.join(assetsDir, newName);
        await fs.move(file.path, dest, { overwrite: true });
        savedAssets.thumbnails.push(`/cdn/instances/assets/${newName}`);
      }
    }

    if (files.assetsVideos) {
      const arr = Array.isArray(files.assetsVideos)
        ? files.assetsVideos
        : [files.assetsVideos];
      for (const file of arr) {
        const ext = path.extname(file.originalname);
        const newName = `${nanoid()}${ext}`;
        const dest = path.join(assetsDir, newName);
        await fs.move(file.path, dest, { overwrite: true });
        savedAssets.videos.push(`/cdn/instances/assets/${newName}`);
      }
    }

    emitProgress(instanceId, "RenamingAssets", { savedAssets });

    // 2) If provider === reach => save zip into packages and run RenamingPackage + decompile + encrypt
    if (provider === "reach") {
      if (!files.experienceFile) {
        res
          .status(400)
          .json({ error: "Missing experienceFile for reach provider" });
        return;
      }

      const zipFile = Array.isArray(files.experienceFile)
        ? files.experienceFile[0]
        : files.experienceFile;
      const packageFolderBase = `${instanceFolderName}`;
      const targetPackageZipName = `${packageFolderBase}.zip`;
      const packageFolderKey = buildPackageFolderKey(packageFolderBase);
      const packageZipKey = buildPackageArchiveKey(targetPackageZipName);
      const targetPackageZipPath = path.join(
        packageArchivesDir,
        targetPackageZipName
      );

      // move zip
      await fs.move(zipFile.path, targetPackageZipPath, { overwrite: true });
      emitProgress(instanceId, "RenamingPackage", {
        packageZip: toPublicCdnPathFromKey(packageZipKey),
      });

      // extract
      const targetPackageFolder = path.join(
        packageFoldersDir,
        packageFolderBase
      );
      await fs.ensureDir(targetPackageFolder);
      emitProgress(instanceId, "RenamingPackage", {
        message: "Extracting package",
      });
      await extract(targetPackageZipPath, { dir: targetPackageFolder });

      // After extraction, create a manifest (ManifestMaker)
      // Implement ManifestMaker logic: scan files, generate manifest.json
      // Optional: encrypt /mods folder or all files
      emitProgress(instanceId, "EncryptingPackage", {
        message: "Encrypting package files",
      });
      try {
        const password = process.env.PACKAGE_PASSWORD || "default-pass";
        const reachC = new ReachC(password);

        // Example: encrypt files inside /mods and /assets (you can change scope)
        // Walk files
        const allFiles = await listFilesRecursive(targetPackageFolder);
        for (const f of allFiles) {
          const data = await fs.readFile(f);
          const enc = reachC.encryptRaw(data);
          await fs.writeFile(f, enc);
        }

        emitProgress(instanceId, "EncryptingPackage", {
          message: "Encryption complete",
        });
      } catch (err: any) {
        // encryption errors should not necessarily break entire flow in dev
        emitProgress(instanceId, "EncryptingPackage", { error: err.message });
      }

      const manifestObj = await createPackageManifest(
        targetPackageFolder,
        instanceId,
        name
      );
      manifestCreated = { ...manifestObj, provider };

      // compute size
      const size = await folderSize(targetPackageFolder);

      // save package metadata to doc
      doc.experiencePackage = {
        packageFolder: packageFolderKey,
        packageZip: packageZipKey,
        encrypted: true,
      };
      doc.size = size;

      emitProgress(instanceId, "RenamingPackage", {
        manifest: manifestObj,
      });
    } else if (provider === "curseforge") {
      // For CurseForge: create folder /packages/<instanceFolder>/mods and create manifest.json with mods info
      const packageFolderBase = `${instanceFolderName}`;
      const packageFolderKey = buildPackageFolderKey(packageFolderBase);
      const targetPackageFolder = path.join(
        packageFoldersDir,
        packageFolderBase
      );
      await fs.ensureDir(targetPackageFolder);

      emitProgress(instanceId, "CreatingCurseForge", {
        message: "Creating CurseForge manifest",
      });

      // Move mods from req.body.mods (if you downloaded them previously) OR create manifest with the given mods array
      let modsArray;
      try {
        modsArray = JSON.parse(body.mods || "[]");
      } catch (e) {
        modsArray = body.mods || [];
      }
      if (!Array.isArray(modsArray)) {
        modsArray = [];
      }
      // Compose manifest metadata for CurseForge mods
      const modsFolder = path.join(targetPackageFolder, "mods");
      await fs.ensureDir(modsFolder);
      doc.curseforgeMods = modsArray;
      doc.experiencePackage = {
        packageFolder: packageFolderKey,
        packageZip: null,
        encrypted: false,
      };
      const manifestObj = await createPackageManifest(
        targetPackageFolder,
        instanceId,
        name
      );
      manifestCreated = {
        ...manifestObj,
        provider: "curseforge",
        mods: modsArray,
      };
      doc.size = await folderSize(targetPackageFolder);
      emitProgress(instanceId, "CreatingCurseForge", {
        manifest: manifestCreated,
      });
    } else {
      // modrinth - handle similarly or leave placeholder
      doc.experiencePackage = null;
      doc.size = 0;
    }

    // ApplyingConfig: write instance doc into MongoDB
    emitProgress(instanceId, "ApplyingConfig", {
      message: "Saving instance to DB",
    });
    doc.application.thumbnail = savedAssets.thumbnails[0] || null;
    doc.application.logo = savedAssets.thumbnails[1] || null;
    doc.application.videos = savedAssets.videos;
    doc.updatedAt = new Date();

    // Insert into DB
    await db.insertDocument("instances", doc);

    // Create version document
    const versionDoc: InstanceVersion = {
      versionHash,
      instanceId,
      versionNumber,
      createdAt,
      createdBy: requestedById || subscriptionOwnerId,
      active: true,
      experiencePackage: doc.experiencePackage,
      assets: {
        thumbnails: savedAssets.thumbnails,
        videos: savedAssets.videos,
      },
      size: doc.size || 0,
      downloadCount: 0,
    };
    
    await db.insertDocument("instance_versions", versionDoc);

    emitProgress(instanceId, "ApplyingConfig", {
      message: "Saved",
      instance: { id: instanceId },
      version: { hash: versionHash, number: versionNumber },
    });

    // RefreshingEcosystem: optional, emit placeholder
    emitProgress(instanceId, "RefreshingEcosystem", {
      message: "Refreshing ecosystem (placeholder)",
    });

    // Respond
    emitProgress(instanceId, "Cleaning", { finish: true });
    res
      .status(201)
      .json({ ok: true, instanceId, manifest: manifestCreated });
  } catch (err: any) {
    console.error("createInstanceHandler error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
}

export async function createManifestSignature(req: Request, res: Response) {
  try {
    const { instanceId } = req.params;
    const db = getExperiencesDB();

    const instances = await db.findDocuments("instances", { id: instanceId });
    if (!instances?.length) {
      return ResponseHandler.notFound(res, "Instance");
    }

    const instance = instances[0];
    const pkgResult = await getActiveVersionPackage(instanceId, instance);

    if (!pkgResult.success) {
      return res.status(404).json({ ok: false, error: pkgResult.error });
    }

    const { version, folderPath } = pkgResult;
    const manifestContent = await createPackageManifest(folderPath, instance.id, instance.name);
    const basePublicPath = `/${path.relative(multerDirSafe(), folderPath)}`
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    const secureFiles = manifestContent.files.map((filePath: string) => {
      const normalizedPath = filePath.replace(/\\/g, "/");
      return {
        path: normalizedPath,
        url: generateSignedUrl(`${basePublicPath}/${normalizedPath}`.replace(/\/{2,}/g, "/"), PACKAGE_SIGNED_URL_TTL),
      };
    });

    const responseManifest: any = {
      id: manifestContent.id,
      name: manifestContent.name,
      files: secureFiles,
      totalFiles: secureFiles.length,
      generatedAt: manifestContent.generatedAt,
    };

    if (instance.provider) responseManifest.provider = instance.provider;
    if (instance.provider === "curseforge" && instance.curseforgeMods) {
      responseManifest.mods = instance.curseforgeMods;
    }

    const pkg = version.experiencePackage ?? {};
    const packageZipSignedUrl = toSignedCdnUrlFromKey(pkg.packageZip ?? pkg.packageZipKey);
    if (packageZipSignedUrl) {
      responseManifest.packageZip = { url: packageZipSignedUrl, expiresIn: PACKAGE_SIGNED_URL_TTL };
    }

    res.status(200).json({ ok: true, manifest: responseManifest });
  } catch (error: any) {
    console.error(`[Manifest Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function createPackageChecksum(req: Request, res: Response) {
  try {
    const { instanceId } = req.params;
    const db = getExperiencesDB();

    const instances = await db.findDocuments("instances", { id: instanceId });
    if (!instances?.length) {
      return ResponseHandler.notFound(res, "Instance");
    }

    const instance = instances[0];
    const pkgResult = await getActiveVersionPackage(instanceId, instance);

    if (!pkgResult.success) {
      return res.status(404).json({ ok: false, error: pkgResult.error });
    }

    const { folderPath } = pkgResult;
    const allFiles = await listFilesRecursive(folderPath);

    const checksums = await Promise.all(
      allFiles.map(async (filePath) => {
        const relativePath = path.relative(folderPath, filePath).split(path.sep).join("/");
        const fileBuffer = await fs.readFile(filePath);
        const stat = await fs.stat(filePath);
        return {
          path: relativePath,
          sha256: crypto.createHash("sha256").update(fileBuffer).digest("hex"),
          size: stat.size,
        };
      })
    );

    res.status(200).json({
      ok: true,
      instanceId: instance.id,
      name: instance.name,
      provider: instance.provider,
      totalFiles: checksums.length,
      checksums,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[Checksum Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function uploadNewVersion(req: Request, res: Response) {
  try {
    const { instanceId } = req.params;
    const body = req.body;
    const files: any = req.files || {};
    const requestedById = body.ownerID?.trim() || "";

    const ctxResult = await getInstanceContext(instanceId, requestedById);
    if (!ctxResult.success) {
      return res.status(ctxResult.status).json({ ok: false, error: ctxResult.error });
    }

    const { instance, subscriptionOwnerId, hasPermission } = ctxResult.context;
    if (!hasPermission) {
      return ResponseHandler.forbidden(res, "You don't have permission to upload versions for this instance.");
    }

    const db = getExperiencesDB();
    const planType = await getPlanType(instance.organizationId);
    const versionLimit = VERSION_LIMITS[planType];
    const existingVersions = await db.findDocuments("instance_versions", { instanceId });

    const newVersionNumber = (instance.activeVersionNumber || 0) + 1;
    const versionHash = generateVersionHash();
    const createdAt = new Date();
    const isOwner = await isOrganizationOwner(instance.organizationId, requestedById || subscriptionOwnerId);
    const newCurrentVersion = body.currentVersion || autoIncrementSemanticVersion(instance.currentVersion || "1.0.0");

    emitProgress(instanceId, "UploadingNewVersion", {
      message: `Starting version ${newVersionNumber} upload`,
      versionNumber: newVersionNumber,
    });

    const instanceFolderName = `${instanceId}_${instance.name.replace(/\\s+/g, "_").toLowerCase()}_v${newVersionNumber}`;
    const instancesRoot = path.join(multerDirSafe(), "instances");
    const assetsDir = path.join(instancesRoot, "assets");
    const packageFoldersDir = path.join(instancesRoot, "experience-folders");
    const packageArchivesDir = path.join(instancesRoot, "experience-archives");

    await Promise.all([fs.ensureDir(assetsDir), fs.ensureDir(packageFoldersDir), fs.ensureDir(packageArchivesDir)]);
    const savedAssets = await saveAssetFiles(files, assetsDir);

    const approvalStatus = isOwner ? "approved" : "pending";
    const needsApproval = !isOwner;

    let newVersionDoc: InstanceVersion = {
      versionHash,
      instanceId,
      versionNumber: newVersionNumber,
      createdAt,
      createdBy: requestedById || subscriptionOwnerId,
      active: isOwner,
      approvalStatus,
      experiencePackage: null,
      assets: savedAssets,
      size: 0,
      changelog: body.changelog || "",
      downloadCount: 0,
      tags: body.tags ? (Array.isArray(body.tags) ? body.tags : body.tags.split(",").map((t: string) => t.trim())) : [],
      notes: body.notes || "",
    };

    if (instance.provider === "reach") {
      if (!files.experienceFile) {
        return res.status(400).json({ error: "Missing experienceFile for reach provider" });
      }

      const zipFile = Array.isArray(files.experienceFile) ? files.experienceFile[0] : files.experienceFile;
      const packageFolderBase = instanceFolderName;
      const targetPackageZipName = `${packageFolderBase}.zip`;
      const packageFolderKey = buildPackageFolderKey(packageFolderBase);
      const packageZipKey = buildPackageArchiveKey(targetPackageZipName);
      const targetPackageZipPath = path.join(packageArchivesDir, targetPackageZipName);
      const targetPackageFolder = path.join(packageFoldersDir, packageFolderBase);

      await fs.move(zipFile.path, targetPackageZipPath, { overwrite: true });
      emitProgress(instanceId, "ProcessingVersion", { message: "Extracting package", versionNumber: newVersionNumber });

      await fs.ensureDir(targetPackageFolder);
      await extract(targetPackageZipPath, { dir: targetPackageFolder });

      emitProgress(instanceId, "EncryptingVersion", { message: "Encrypting package files", versionNumber: newVersionNumber });

      try {
        const reachC = new ReachC(process.env.PACKAGE_PASSWORD || "default-pass");
        const allFiles = await listFilesRecursive(targetPackageFolder);
        for (const f of allFiles) {
          const data = await fs.readFile(f);
          await fs.writeFile(f, reachC.encryptRaw(data));
        }
        emitProgress(instanceId, "EncryptingVersion", { message: "Encryption complete", versionNumber: newVersionNumber });
      } catch (err: any) {
        emitProgress(instanceId, "EncryptingVersion", { error: err.message, versionNumber: newVersionNumber });
      }

      newVersionDoc.experiencePackage = { packageFolder: packageFolderKey, packageZip: packageZipKey, encrypted: true };
      newVersionDoc.size = await folderSize(targetPackageFolder);
    } else if (instance.provider === "curseforge") {
      const packageFolderBase = instanceFolderName;
      const packageFolderKey = buildPackageFolderKey(packageFolderBase);
      const targetPackageFolder = path.join(packageFoldersDir, packageFolderBase);

      await fs.ensureDir(targetPackageFolder);
      await fs.ensureDir(path.join(targetPackageFolder, "mods"));

      newVersionDoc.experiencePackage = { packageFolder: packageFolderKey, packageZip: null, encrypted: false };
      newVersionDoc.size = await folderSize(targetPackageFolder);
    }

    if (!needsApproval) {
      await db.updateDocuments("instance_versions", { instanceId, active: true }, { $set: { active: false } });
    }

    await db.insertDocument("instance_versions", newVersionDoc);

    const updateFields: any = {
      totalVersions: existingVersions.length + 1,
      updatedAt: createdAt,
      size: newVersionDoc.size,
    };

    if (!needsApproval) {
      updateFields.activeVersionHash = versionHash;
      updateFields.activeVersionNumber = newVersionNumber;
      updateFields.currentVersion = newCurrentVersion;
    }

    await db.updateDocuments("instances", { id: instanceId }, { $set: updateFields });

    await createInstanceLog({
      instanceId,
      action: "version_created",
      performedBy: requestedById || subscriptionOwnerId,
      timestamp: createdAt,
      versionHash,
      versionNumber: newVersionNumber,
      metadata: { approvalStatus, changelog: body.changelog, size: newVersionDoc.size },
    });

    if (existingVersions.length + 1 > versionLimit) {
      await cleanOldVersions(instanceId, versionLimit);
    }

    const io = socketClient?.getIO?.();
    if (io) {
      const event = needsApproval ? "instance-version-pending" : "instance-version-update";
      io.emit(event, {
        instanceId,
        versionHash,
        versionNumber: newVersionNumber,
        createdBy: needsApproval ? requestedById : undefined,
        message: `Version ${newVersionNumber} ${needsApproval ? "pending approval" : "available"}`,
      });
    }

    emitProgress(instanceId, "VersionComplete", { finish: true, versionHash, versionNumber: newVersionNumber, needsApproval });

    res.status(201).json({
      ok: true,
      instanceId,
      versionHash,
      versionNumber: newVersionNumber,
      approvalStatus,
      message: needsApproval ? "Version uploaded successfully and pending approval" : "Version uploaded successfully",
    });
  } catch (err: any) {
    console.error("uploadNewVersion error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
}

export async function getInstanceVersions(req: Request, res: Response) {
  try {
    const { instanceId } = req.params;
    const { includeInactive } = req.query;
    
    const db = getExperiencesDB();
    const instances = await db.findDocuments("instances", { id: instanceId });
    
    if (!instances || instances.length === 0) {
      ResponseHandler.notFound(res, "Instance");
      return;
    }
    
    const query: any = { instanceId };
    if (includeInactive !== "true") {
      query.active = true;
    }
    
    const versions = await db.findDocuments("instance_versions", query);
    
    const sortedVersions = versions.sort((a: any, b: any) => b.versionNumber - a.versionNumber);
    
    res.status(200).json({
      ok: true,
      instanceId,
      totalVersions: sortedVersions.length,
      versions: sortedVersions.map((v: any) => ({
        versionHash: v.versionHash,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        createdBy: v.createdBy,
        active: v.active,
        size: v.size,
        changelog: v.changelog,
        downloadCount: v.downloadCount,
        tags: v.tags,
        notes: v.notes,
      })),
    });
    
  } catch (error: any) {
    console.error(`[Get Versions Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function checkForUpdate(req: Request, res: Response) {
  try {
    const { instanceId } = req.params;
    const { versionHash } = req.query;
    
    if (!versionHash || typeof versionHash !== "string") {
      res.status(400).json({
        ok: false,
        error: "versionHash query parameter is required",
      });
      return;
    }
    
    const db = getExperiencesDB();
    const instances = await db.findDocuments("instances", { id: instanceId });
    
    if (!instances || instances.length === 0) {
      ResponseHandler.notFound(res, "Instance");
      return;
    }
    
    const instance = instances[0];
    const currentVersionHash = instance.activeVersionHash;
    
    if (versionHash === currentVersionHash) {
      res.status(200).json({
        ok: true,
        hasUpdate: false,
        currentVersion: {
          versionHash,
          versionNumber: instance.activeVersionNumber,
          message: "You have the latest version",
        },
      });
      return;
    }
    
    const activeVersions = await db.findDocuments("instance_versions", {
      instanceId,
      active: true,
    });
    
    if (!activeVersions || activeVersions.length === 0) {
      res.status(404).json({
        ok: false,
        error: "No active version found",
      });
      return;
    }
    
    const latestVersion = activeVersions[0];
    
    res.status(200).json({
      ok: true,
      hasUpdate: true,
      currentVersion: {
        versionHash: versionHash,
      },
      latestVersion: {
        versionHash: latestVersion.versionHash,
        versionNumber: latestVersion.versionNumber,
        createdAt: latestVersion.createdAt,
        size: latestVersion.size,
        changelog: latestVersion.changelog,
        notes: latestVersion.notes,
      },
    });
    
  } catch (error: any) {
    console.error(`[Check Update Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function updateVersionAssets(req: Request, res: Response) {
  try {
    const { instanceId, versionHash } = req.params;
    const requestedById = req.body.ownerID?.trim() || "";
    const files: any = req.files || {};

    const ctxResult = await getInstanceContext(instanceId, requestedById);
    if (!ctxResult.success) {
      return res.status(ctxResult.status).json({ ok: false, error: ctxResult.error });
    }

    if (!ctxResult.context.hasPermission) {
      return ResponseHandler.forbidden(res, "You don't have permission to modify this version.");
    }

    const db = getExperiencesDB();
    const versions = await db.findDocuments("instance_versions", { instanceId, versionHash });
    if (!versions?.length) {
      return ResponseHandler.notFound(res, "Version");
    }

    const version = versions[0];
    const assetsDir = path.join(multerDirSafe(), "instances", "assets");
    const newAssets = await saveAssetFiles(files, assetsDir);

    const updatedAssets = {
      thumbnails: [...(version.assets?.thumbnails || []), ...newAssets.thumbnails],
      videos: [...(version.assets?.videos || []), ...newAssets.videos],
    };

    await db.updateDocuments("instance_versions", { versionHash }, { $set: { assets: updatedAssets } });

    res.status(200).json({ ok: true, versionHash, assets: updatedAssets, message: "Assets updated successfully" });
  } catch (error: any) {
    console.error(`[Update Assets Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function activateVersion(req: Request, res: Response) {
  try {
    const { instanceId, versionHash } = req.params;
    const requestedById = req.body.ownerID?.trim() || "";

    const ctxResult = await getInstanceContext(instanceId, requestedById);
    if (!ctxResult.success) {
      return res.status(ctxResult.status).json({ ok: false, error: ctxResult.error });
    }

    const { subscriptionOwnerId, hasPermission } = ctxResult.context;
    if (!hasPermission) {
      return ResponseHandler.forbidden(res, "You don't have permission to activate versions.");
    }

    const db = getExperiencesDB();
    const versions = await db.findDocuments("instance_versions", { instanceId, versionHash });
    if (!versions?.length) {
      return ResponseHandler.notFound(res, "Version");
    }

    const versionToActivate = versions[0];
    if (versionToActivate.active) {
      return res.status(400).json({ ok: false, error: "This version is already active" });
    }

    await db.updateDocuments("instance_versions", { instanceId, active: true }, { $set: { active: false } });
    await db.updateDocuments("instance_versions", { versionHash }, { $set: { active: true } });
    await db.updateDocuments("instances", { id: instanceId }, {
      $set: {
        activeVersionHash: versionHash,
        activeVersionNumber: versionToActivate.versionNumber,
        updatedAt: new Date(),
        size: versionToActivate.size,
      },
    });

    await createInstanceLog({
      instanceId,
      action: "version_activated",
      performedBy: requestedById || subscriptionOwnerId,
      timestamp: new Date(),
      versionHash,
      versionNumber: versionToActivate.versionNumber,
      metadata: { rollback: true },
    });

    const io = socketClient?.getIO?.();
    io?.emit("instance-version-update", {
      instanceId,
      versionHash,
      versionNumber: versionToActivate.versionNumber,
      message: `Version ${versionToActivate.versionNumber} activated (rollback)`,
    });

    res.status(200).json({
      ok: true,
      versionHash,
      versionNumber: versionToActivate.versionNumber,
      message: "Version activated successfully",
    });
  } catch (error: any) {
    console.error(`[Activate Version Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function browseVersionFiles(req: Request, res: Response) {
  try {
    const { instanceId, versionHash } = req.params;
    const { path: requestedPath } = req.query;
    
    const db = getExperiencesDB();
    
    const versions = await db.findDocuments("instance_versions", {
      instanceId,
      versionHash,
    });
    
    if (!versions || versions.length === 0) {
      ResponseHandler.notFound(res, "Version");
      return;
    }
    
    const version = versions[0];
    
    if (!version.experiencePackage || !version.experiencePackage.packageFolder) {
      res.status(404).json({
        ok: false,
        error: "No package folder available for this version",
      });
      return;
    }
    
    const packageFolderKey = normalizePackageKey(version.experiencePackage.packageFolder);
    if (!packageFolderKey) {
      res.status(404).json({
        ok: false,
        error: "Invalid package folder configuration",
      });
      return;
    }
    
    const packageFolderRelative = packageFolderKey.replace(/^\/+/, "");
    const packageFolderFullPath = path.join(multerDirSafe(), packageFolderRelative);
    
    if (!(await fs.pathExists(packageFolderFullPath))) {
      res.status(404).json({
        ok: false,
        error: "Package folder not found on disk",
      });
      return;
    }
    
    const targetPath = requestedPath 
      ? path.join(packageFolderFullPath, requestedPath as string)
      : packageFolderFullPath;
    
    if (!targetPath.startsWith(packageFolderFullPath)) {
      res.status(400).json({
        ok: false,
        error: "Invalid path (directory traversal attempt)",
      });
      return;
    }
    
    if (!(await fs.pathExists(targetPath))) {
      res.status(404).json({
        ok: false,
        error: "Requested path not found",
      });
      return;
    }
    
    const stats = await fs.stat(targetPath);
    
    if (stats.isDirectory()) {
      const items = await fs.readdir(targetPath);
      const files: any[] = [];
      
      for (const item of items) {
        const itemPath = path.join(targetPath, item);
        try {
          const itemStats = await fs.stat(itemPath);
          const relativePath = path.relative(packageFolderFullPath, itemPath).split(path.sep).join("/");
          
          files.push({
            name: item,
            path: relativePath,
            type: itemStats.isDirectory() ? "directory" : "file",
            size: itemStats.size,
            modified: itemStats.mtime,
          });
        } catch (err) {
          console.warn(`Could not stat ${item}:`, err);
        }
      }
      
      res.status(200).json({
        ok: true,
        type: "directory",
        path: requestedPath || "/",
        files,
      });
    } else {
      const relativePath = path.relative(packageFolderFullPath, targetPath).split(path.sep).join("/");
      
      res.status(200).json({
        ok: true,
        type: "file",
        path: relativePath,
        name: path.basename(targetPath),
        size: stats.size,
        modified: stats.mtime,
      });
    }
    
  } catch (error: any) {
    console.error(`[Browse Files Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function compareVersions(req: Request, res: Response) {
  try {
    const { instanceId, hashA, hashB } = req.params;
    
    const db = getExperiencesDB();
    
    const versionsA = await db.findDocuments("instance_versions", {
      instanceId,
      versionHash: hashA,
    });
    
    const versionsB = await db.findDocuments("instance_versions", {
      instanceId,
      versionHash: hashB,
    });
    
    if (!versionsA || versionsA.length === 0) {
      res.status(404).json({
        ok: false,
        error: `Version ${hashA} not found`,
      });
      return;
    }
    
    if (!versionsB || versionsB.length === 0) {
      res.status(404).json({
        ok: false,
        error: `Version ${hashB} not found`,
      });
      return;
    }
    
    const versionA = versionsA[0];
    const versionB = versionsB[0];
    
    if (!versionA.experiencePackage?.packageFolder || !versionB.experiencePackage?.packageFolder) {
      res.status(400).json({
        ok: false,
        error: "One or both versions do not have package folders",
      });
      return;
    }
    
    const folderAKey = normalizePackageKey(versionA.experiencePackage.packageFolder);
    const folderBKey = normalizePackageKey(versionB.experiencePackage.packageFolder);
    
    if (!folderAKey || !folderBKey) {
      res.status(400).json({
        ok: false,
        error: "Invalid package folder configuration",
      });
      return;
    }
    
    const folderAPath = path.join(multerDirSafe(), folderAKey.replace(/^\/+/, ""));
    const folderBPath = path.join(multerDirSafe(), folderBKey.replace(/^\/+/, ""));
    
    if (!(await fs.pathExists(folderAPath)) || !(await fs.pathExists(folderBPath))) {
      res.status(404).json({
        ok: false,
        error: "One or both package folders not found on disk",
      });
      return;
    }
    
    const filesA = await listFilesRecursive(folderAPath);
    const filesB = await listFilesRecursive(folderBPath);
    
    const relativeFilesA = new Map<string, number>();
    for (const f of filesA) {
      const rel = path.relative(folderAPath, f).split(path.sep).join("/");
      const stat = await fs.stat(f);
      relativeFilesA.set(rel, stat.size);
    }
    
    const relativeFilesB = new Map<string, number>();
    for (const f of filesB) {
      const rel = path.relative(folderBPath, f).split(path.sep).join("/");
      const stat = await fs.stat(f);
      relativeFilesB.set(rel, stat.size);
    }
    
    const diff: FileDiffResult = {
      added: [],
      modified: [],
      deleted: [],
      unchanged: 0,
    };
    
    for (const [filePath, sizeB] of relativeFilesB) {
      if (!relativeFilesA.has(filePath)) {
        diff.added.push({ path: filePath, size: sizeB });
      } else {
        const sizeA = relativeFilesA.get(filePath)!;
        if (sizeA !== sizeB) {
          diff.modified.push({ path: filePath, oldSize: sizeA, newSize: sizeB });
        } else {
          diff.unchanged++;
        }
      }
    }
    
    for (const [filePath, sizeA] of relativeFilesA) {
      if (!relativeFilesB.has(filePath)) {
        diff.deleted.push({ path: filePath, size: sizeA });
      }
    }
    
    res.status(200).json({
      ok: true,
      versionA: {
        versionHash: hashA,
        versionNumber: versionA.versionNumber,
        totalFiles: relativeFilesA.size,
      },
      versionB: {
        versionHash: hashB,
        versionNumber: versionB.versionNumber,
        totalFiles: relativeFilesB.size,
      },
      diff,
    });
    
  } catch (error: any) {
    console.error(`[Compare Versions Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function getInstanceLogs(req: Request, res: Response) {
  try {
    const { instanceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getExperiencesDB();
    const instances = await db.findDocuments("instances", { id: instanceId });
    if (!instances?.length) {
      return ResponseHandler.notFound(res, "Instance");
    }

    const logs = await db.findDocuments("instance_logs", { instanceId });
    const sortedLogs = logs.sort((a: any, b: any) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.status(200).json({
      ok: true,
      instanceId,
      totalLogs: sortedLogs.length,
      limit,
      offset,
      logs: sortedLogs.slice(offset, offset + limit).map((log: any) => ({
        action: log.action,
        performedBy: log.performedBy,
        timestamp: log.timestamp,
        versionHash: log.versionHash,
        versionNumber: log.versionNumber,
        metadata: log.metadata,
      })),
    });
  } catch (error: any) {
    console.error(`[Get Logs Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function updateInstance(req: Request, res: Response) {
  try {
    const { instanceId } = req.params;
    const body = req.body;
    const requestedById = body.ownerID?.trim() || "";

    const ctxResult = await getInstanceContext(instanceId, requestedById);
    if (!ctxResult.success) {
      return res.status(ctxResult.status).json({ ok: false, error: ctxResult.error });
    }

    const { subscriptionOwnerId, hasPermission } = ctxResult.context;
    if (!hasPermission) {
      return ResponseHandler.forbidden(res, "You don't have permission to update this instance.");
    }

    const updateFields: Record<string, any> = { updatedAt: new Date() };

    // Map simple fields
    if (body.name?.trim()) updateFields.name = body.name.trim();
    if (body.description !== undefined) updateFields.description = body.description;

    // Map application fields
    const appFields = ["activitydc", "largekeydc", "smallkeydc", "detailsdc"];
    for (const field of appFields) {
      if (body[field] !== undefined) updateFields[`application.${field}`] = body[field];
    }

    const db = getExperiencesDB();
    await db.updateDocuments("instances", { id: instanceId }, { $set: updateFields });

    await createInstanceLog({
      instanceId,
      action: "instance_updated",
      performedBy: requestedById || subscriptionOwnerId,
      timestamp: new Date(),
      metadata: { updatedFields: Object.keys(updateFields).filter((k) => k !== "updatedAt") },
    });

    res.status(200).json({ ok: true, instanceId, message: "Instance updated successfully" });
  } catch (error: any) {
    console.error(`[Update Instance Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

export async function approveVersion(req: Request, res: Response) {
  try {
    const { instanceId, versionHash } = req.params;
    const { action, ownerID } = req.body;
    const requestedById = ownerID?.trim() || "";

    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({ ok: false, error: "Action must be 'approve' or 'reject'" });
    }

    const db = getExperiencesDB();
    const instances = await db.findDocuments("instances", { id: instanceId });
    if (!instances?.length) {
      return ResponseHandler.notFound(res, "Instance");
    }

    const instance = instances[0];
    const isOwner = await isOrganizationOwner(instance.organizationId, requestedById);
    if (!isOwner) {
      return ResponseHandler.forbidden(res, "Only organization owner can approve/reject versions.");
    }
    
    const versions = await db.findDocuments("instance_versions", { instanceId, versionHash });
    if (!versions?.length) {
      return ResponseHandler.notFound(res, "Version");
    }

    const version = versions[0];
    if (version.approvalStatus !== "pending") {
      return res.status(400).json({ ok: false, error: `Version is already ${version.approvalStatus}` });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";
    const now = new Date();
    const updateFields: Record<string, any> = {
      approvalStatus: newStatus,
      approvedBy: requestedById,
      approvedAt: now,
    };

    if (action === "approve") {
      updateFields.active = true;
      await db.updateDocuments("instance_versions", { instanceId, active: true }, { $set: { active: false } });
      await db.updateDocuments("instances", { id: instanceId }, {
        $set: {
          activeVersionHash: versionHash,
          activeVersionNumber: version.versionNumber,
          updatedAt: now,
          size: version.size,
        },
      });
    }

    await db.updateDocuments("instance_versions", { versionHash }, { $set: updateFields });

    await createInstanceLog({
      instanceId,
      action: action === "approve" ? "version_approved" : "version_rejected",
      performedBy: requestedById,
      timestamp: now,
      versionHash,
      versionNumber: version.versionNumber,
      metadata: { createdBy: version.createdBy },
    });

    const io = socketClient?.getIO?.();
    if (io) {
      const event = action === "approve" ? "instance-version-update" : "instance-version-rejected";
      io.emit(event, {
        instanceId,
        versionHash,
        versionNumber: version.versionNumber,
        message: `Version ${version.versionNumber} ${action === "approve" ? "approved and activated" : "rejected"}`,
      });
    }

    res.status(200).json({
      ok: true,
      versionHash,
      approvalStatus: newStatus,
      message: `Version ${action === "approve" ? "approved" : "rejected"} successfully`,
    });
  } catch (error: any) {
    console.error(`[Approve Version Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

async function cleanOldVersions(instanceId: string, versionLimit: number) {
  try {
    const db = getExperiencesDB();
    const versions = await db.findDocuments("instance_versions", { instanceId });
    const sortedVersions = versions.sort((a: any, b: any) => b.versionNumber - a.versionNumber);

    if (sortedVersions.length <= versionLimit) return;

    for (const version of sortedVersions.slice(versionLimit)) {
      const pkg = version.experiencePackage;
      if (pkg) {
        for (const key of [pkg.packageFolder, pkg.packageZip].filter(Boolean)) {
          const filePath = path.join(multerDirSafe(), key.replace(/^\/+/, ""));
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            console.log(`Deleted: ${filePath}`);
          }
        }
      }

      await db.deleteDocuments("instance_versions", { versionHash: version.versionHash });
      await createInstanceLog({
        instanceId,
        action: "version_deleted",
        performedBy: "system",
        timestamp: new Date(),
        versionHash: version.versionHash,
        versionNumber: version.versionNumber,
        metadata: { reason: "auto-cleanup" },
      });
    }

    const remaining = await db.findDocuments("instance_versions", { instanceId });
    await db.updateDocuments("instances", { id: instanceId }, { $set: { totalVersions: remaining.length } });
  } catch (error: any) {
    console.error(`[Clean Old Versions Error]: ${error.message}`);
  }
}

export async function cleanOldVersionsGlobal() {
  try {
    const db = getExperiencesDB();
    const allInstances = await db.findDocuments("instances", {});

    for (const instance of allInstances) {
      try {
        const planType = await getPlanType(instance.organizationId);
        const versionLimit = VERSION_LIMITS[planType];
        const versions = await db.findDocuments("instance_versions", { instanceId: instance.id });

        if (versions.length > versionLimit) {
          console.log(`[Global Cleanup] Instance ${instance.name} (${instance.id}) exceeds limit. Cleaning...`);
          await cleanOldVersions(instance.id, versionLimit);
        }
      } catch (err) {
        console.error(`[Global Cleanup] Error processing instance ${instance.id}:`, err);
      }
    }
    console.log("[Global Cleanup] Completed");
  } catch (error: any) {
    console.error(`[Global Cleanup Error]: ${error.message}`);
  }
}

async function createPackageManifest(targetFolder: string, instanceId: string, name: string) {
  const files = await listFilesRecursive(targetFolder);
  return {
    id: instanceId,
    name,
    files: files.map((f) => path.relative(targetFolder, f).split(path.sep).join("/")),
    generatedAt: new Date().toISOString(),
  };
}

async function listFilesRecursive(folder: string): Promise<string[]> {
  const results: string[] = [];
  const walk = async (dir: string) => {
    for (const item of await fs.readdir(dir)) {
      const full = path.join(dir, item);
      const stat = await fs.stat(full);
      stat.isDirectory() ? await walk(full) : results.push(full);
    }
  };
  await walk(folder);
  return results;
}

async function folderSize(folder: string): Promise<number> {
  const files = await listFilesRecursive(folder);
  let total = 0;
  for (const f of files) {
    total += (await fs.stat(f)).size;
  }
  return total;
}

async function createInstanceLog(log: InstanceLog) {
  try {
    const db = getExperiencesDB();
    await db.insertDocument("instance_logs", { ...log, timestamp: new Date() });
  } catch (error: any) {
    console.error(`[Create Log Error]: ${error.message}`);
  }
}

async function isOrganizationOwner(organizationId: string, userId: string): Promise<boolean> {
  try {
    // Using DEVELOPERS_DB for organizations
    const orgs = await getDevelopersDB().findDocuments("organizations", {
      _id: getDevelopersDB().createObjectId(organizationId),
    });
    return orgs?.[0]?.ownerId?.trim() === userId;
  } catch {
    return false;
  }
}

const autoIncrementSemanticVersion = (version: string): string => {
  const parts = version.split(".");
  if (parts.length !== 3) return version;
  return `${parts[0]}.${parts[1]}.${(parseInt(parts[2]) || 0) + 1}`;
};
