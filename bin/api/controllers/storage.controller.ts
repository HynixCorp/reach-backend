import path from "path";
import fs from "fs-extra";
import { nanoid } from "nanoid";
import extract from "extract-zip";
import { Request, Response } from "express";
import { multerDirSafe } from "../../common/utils";
import { ReachC } from "../../common/cryptography/reachCrypto";
import { socketClient } from "../../common/socketio/bridge";
import { usageToken } from "../../common/reach/usage";
import { getOrganizationIdFromBID } from "../../common/reach/orgs.provider";
import { generateSignedUrl } from "../../common/cdnMiddleware";
import { getReachDB } from "../../common/services/database.service";
import { ResponseHandler } from "../../common/services/response.service";

function emitProgress(instanceId: string, step: string, payload?: any) {
  try {
    const io = socketClient?.getIO?.();
    if (io) {
      io.emit("instance-progress", { instanceId, step, ...(payload ?? {}) });
    } else {
      console.warn("Socket IO not ready: IO unavailable");
    }
  } catch (e) {
    console.warn("Socket IO not ready", e);
  }
}

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
    const db = getReachDB();
    const body = req.body;
    const provider = body.provider;
    const ownerID = req.body.ownerID || "unknown-owner";
    const name = body.name;
    const status = body.status || "activepublic";
    const createdAt = new Date();
    const id = nanoid();

    const publisherId = await getOrganizationIdFromBID(ownerID);

    const instanceId = id;
    const instanceFolderName = `${instanceId}_${name
      .replace(/\s+/g, "_")
      .toLowerCase()}`;

    const instancesRoot = path.join(multerDirSafe(), "instances");
    const assetsDir = path.join(instancesRoot, "assets");
    const packagesDir = path.join(instancesRoot, "packages");
    await fs.ensureDir(assetsDir);
    await fs.ensureDir(packagesDir);

    const documentExist = await db.findDocuments("instances", {
      name,
    });

    if (documentExist.length > 0) {
      throw new Error("Already instance with this name.");
    }

    const doc: any = {
      id: instanceId,
      name,
      createdAt,
      updatedAt: createdAt,
      currentVersion: "1.0.0",
      provider,
      ownerID: publisherId,
      status,
      options: {
        discordCustom: body["options[discordCustom]"] === "true" || false,
      },
      application: {
        gameVersion: body.gameVersion,
        activitydc: body.activitydc,
        detailsdc: body.detailsdc,
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

    const consume = await usageToken(ownerID, type);

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
      const targetPackageZipPath = path.join(packagesDir, targetPackageZipName);

      // move zip
      await fs.move(zipFile.path, targetPackageZipPath, { overwrite: true });
      emitProgress(instanceId, "RenamingPackage", {
        packageZip: `/cdn/instances/packages/${targetPackageZipName}`,
      });

      // extract
      const targetPackageFolder = path.join(packagesDir, packageFolderBase);
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
        packageFolder: `/cdn/instances/packages/${packageFolderBase}`,
        packageZip: `/cdn/instances/packages/${targetPackageZipName}`,
        encrypted: true,
      };
      doc.size = size;

      emitProgress(instanceId, "RenamingPackage", {
        manifest: manifestObj,
      });
    } else if (provider === "curseforge") {
      // For CurseForge: create folder /packages/<instanceFolder>/mods and create manifest.json with mods info
      const packageFolderBase = `${instanceFolderName}`;
      const targetPackageFolder = path.join(packagesDir, packageFolderBase);
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
        packageFolder: `/cdn/instances/packages/${packageFolderBase}`,
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

    emitProgress(instanceId, "ApplyingConfig", {
      message: "Saved",
      instance: { id: instanceId },
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
    
    const db = getReachDB();
    const instances = await db.findDocuments("instances", { id: instanceId });
    
    if (!instances || instances.length === 0) {
      ResponseHandler.notFound(res, "Instance");
      return;
    }
    
    const instance = instances[0];
    
    const packageFolderPublic =
      instance.experiencePackage?.packageFolder ||
      (instance.packageManifest
        ? path.dirname(instance.packageManifest)
        : null);

    if (!packageFolderPublic) {
      res.status(404).json({
        ok: false,
        error: "Package folder not configured for this instance",
      });
      return;
    }

    const packageFolderRelative = packageFolderPublic.replace("/cdn", "");
    const packageFolderRelativeClean = packageFolderRelative.replace(
      /^[/\\]/,
      ""
    );
    const packageFolderFullPath = path.join(
      multerDirSafe(),
      packageFolderRelativeClean
    );

    if (!(await fs.pathExists(packageFolderFullPath))) {
      res.status(404).json({
        ok: false,
        error: "Package folder not found",
      });
      return;
    }

    const manifestContent = await createPackageManifest(
      packageFolderFullPath,
      instance.id,
      instance.name
    );

    const basePublicPath = (packageFolderRelative.startsWith("/")
      ? packageFolderRelative
      : `/${packageFolderRelative}`)
      .replace(/\\/g, "/")
      .replace(/\/$/, "");

    const secureFiles = manifestContent.files.map((filePath: string) => {
      const normalizedPath = filePath.replace(/\\/g, "/");
      const publicFilePath = `${basePublicPath}/${normalizedPath}`.replace(
        /\/{2,}/g,
        "/"
      );

      return {
        path: normalizedPath,
        url: generateSignedUrl(publicFilePath, 300),
      };
    });

    const responseManifest: any = {
      id: manifestContent.id,
      name: manifestContent.name,
      files: secureFiles,
      totalFiles: secureFiles.length,
      generatedAt: manifestContent.generatedAt,
    };

    if (instance.provider) {
      responseManifest.provider = instance.provider;
    }

    if (instance.provider === "curseforge" && instance.curseforgeMods) {
      responseManifest.mods = instance.curseforgeMods;
    }

    res.status(200).json({
      ok: true,
      manifest: responseManifest,
    });
    
  } catch (error: any) {
    console.error(`[Manifest Error]: ${error.message}`);
    ResponseHandler.serverError(res, error);
  }
}

// --- Helpers used in controller --- //

async function createPackageManifest(
  targetFolder: string,
  instanceId: string,
  name: string
) {
  // simple manifest generator; extend as needed
  const files = await listFilesRecursive(targetFolder);
  const relativeFiles = files.map((f) =>
    path.relative(targetFolder, f).split(path.sep).join("/")
  );
  return {
    id: instanceId,
    name,
    files: relativeFiles,
    generatedAt: new Date().toISOString(),
  };
}

async function listFilesRecursive(folder: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    const items = await fs.readdir(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) await walk(full);
      else results.push(full);
    }
  }
  await walk(folder);
  return results;
}

async function folderSize(folder: string) {
  let total = 0;
  const files = await listFilesRecursive(folder);
  for (const f of files) {
    const st = await fs.stat(f);
    total += st.size;
  }
  return total;
}
