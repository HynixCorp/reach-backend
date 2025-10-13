import fs from "fs";
import path from "path";
import { fileTypeFromFile } from 'file-type';
import { config } from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { Request, Response } from "express";
import { MongoDB } from "../../common/mongodb/mondodb";
import { InstanceInformation } from "../../types/instances";
import {
    createErrorResponse,
    createGenericResponse,
    createSuccessResponse,
    getAllFilesFromPath,
    multerDirSafe,
    verifyPackageExists
} from "../../common/utils";
import { reach_packageDecompile } from "../../common/resourcesMe/packageDecompile";
import { ReachC } from "../../common/cryptography/reachCrypto";

config();

const REACH_SDK_DB = new MongoDB(process.env.DB_URI as string, "reach");
const REACH_USERS_DB = new MongoDB(process.env.DB_URI as string, "reachauth");
const crypto = new ReachC(process.env.CRYPTO_SECRET!);

async function createNewInstance(req: Request, res: Response) {
    try {
        const {
            name,
            status,
            thumbnailURI,
            logoURI,
            discordCustom,
            allowedUsersIDs,
            gameVersion,
            waitingUntil,
            provider,
            modsURLs,
            ownerID
        } = req.body;

        if (!provider || !["reach", "curseforge", "modrinth"].includes(provider)) {
            return res.status(400).json(createErrorResponse(
                "[REACH - AInstances]: Invalid or missing provider field.",
                400
            ));
        }

        const requiredFields = [name, status, thumbnailURI, logoURI, gameVersion, ownerID, discordCustom];
        const hasAllFields = requiredFields.every(field => field !== undefined && field !== null);
        if (!hasAllFields) {
            return res.status(400).json(createErrorResponse(
                "[REACH - AInstances]: Missing required fields in the request body.",
                400
            ));
        }

        const NAME_PARSED = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        const existingInstance = await REACH_SDK_DB.findDocuments("instances", { name });
        if (existingInstance.length > 0) {
            return res.status(409).json(createGenericResponse(
                false,
                null,
                `[REACH - AInstances]: Instance with name ${name} already exists.`,
                409
            ));
        }

        const ownerExists = await REACH_USERS_DB.findDocuments("account", { accountId: ownerID });
        
        if (ownerExists.length === 0) {
            return res.status(400).json(createErrorResponse(
                "[REACH - AInstances]: Owner account does not exist or is not valid.",
                400
            ));
        }

        const REACH_UUID = uuidv4();
        let UInstanceNew: InstanceInformation;

        // --- Reach-specific logic ---
        if (provider === "reach") {
            const uploadedFile = req.file;
            if (!uploadedFile) {
                return res.status(400).json(createErrorResponse(
                    "[REACH - AInstances]: No instance package file was uploaded.",
                    400
                ));
            }

            const fileType = await fileTypeFromFile(uploadedFile.path);
            if (!fileType || fileType.ext !== "zip") {
                await fs.promises.unlink(uploadedFile.path);
                return res.status(400).json(createErrorResponse(
                    "[REACH - AInstances]: Uploaded file is not a valid ZIP archive.",
                    400
                ));
            }

            const stats = await fs.promises.stat(uploadedFile.path);
            if (stats.size < 100) {
                await fs.promises.unlink(uploadedFile.path);
                return res.status(400).json(createErrorResponse(
                    "[REACH - AInstances]: ZIP file is too small or empty.",
                    400
                ));
            }

            const exists = await verifyPackageExists(uploadedFile.path);
            if (exists) {
                await fs.promises.unlink(uploadedFile.path);
                return res.status(400).json(createErrorResponse(
                    "[REACH - AInstances]: Instance package folder already exists.",
                    400
                ))
            }

            const MULTER_DIR = multerDirSafe();
            const PACKAGE_DIR = path.join(MULTER_DIR, "instances", "packages");
            await fs.promises.mkdir(PACKAGE_DIR, { recursive: true });
            const finalPackagePath = path.join(PACKAGE_DIR, `${REACH_UUID}_${NAME_PARSED}.zip`);
            await fs.promises.rename(uploadedFile.path, finalPackagePath);

            const decompileResult = await reach_packageDecompile(`${REACH_UUID}_${NAME_PARSED}.zip`);
            if (!decompileResult || !decompileResult.manifestPath) {
                return res.status(500).json(createErrorResponse(
                    "[REACH - AInstances]: Failed to decompile the instance package.",
                    500
                ));
            }

            await fs.promises.unlink(finalPackagePath);

            const extractedPath = finalPackagePath.replace('.zip', '');
            const allfilesArray = getAllFilesFromPath(extractedPath);
            const filesArray = allfilesArray.filter(file => !file.endsWith("manifest.json"));

            for (const filePath of filesArray) {
                const fileData = await fs.promises.readFile(filePath);
                const encryptedData = crypto.encryptRaw(fileData);
                await fs.promises.writeFile(filePath, encryptedData);
            }

            const commonFields = {
                id: REACH_UUID,
                name: NAME_PARSED,
                createdAt: new Date(),
                updatedAt: new Date(),
                currentVersion: "1.0.0",
                provider: "reach" as const,
                ownerID,
                application: {
                    thumbnail: thumbnailURI,
                    logo: logoURI,
                    gameVersion
                },
                options: {
                    discordCustom: discordCustom === "true"
                },
                allowedUsersIDs: allowedUsersIDs || [],
                size: stats.size,
                packageManifest: decompileResult.manifestPath
            };

            if (status === "waiting") {
                if (!waitingUntil) {
                    return res.status(400).json(createErrorResponse(
                        "[REACH - AInstances]: 'waitingUntil' is required when status is 'waiting'.",
                        400
                    ));
                }
                UInstanceNew = {
                    ...commonFields,
                    status: "waiting",
                    waitingUntil: new Date(waitingUntil)
                };
            } else {
                UInstanceNew = {
                    ...commonFields,
                    status: status as Exclude<InstanceInformation["status"], "waiting">
                };
            }
        }

        // --- Curseforge / Modrinth logic ---
        else {
            if (!Array.isArray(modsURLs) || modsURLs.length === 0) {
                return res.status(400).json(createErrorResponse(
                    `[REACH - AInstances]: 'modsURLs' is required for provider ${provider}.`,
                    400
                ));
            }

            const commonFields = {
                id: REACH_UUID,
                name: NAME_PARSED,
                createdAt: new Date(),
                updatedAt: new Date(),
                currentVersion: "1.0.0",
                provider: provider as "curseforge" | "modrinth",
                ownerID,
                application: {
                    thumbnail: thumbnailURI,
                    logo: logoURI,
                    gameVersion
                },
                options: {
                    discordCustom: discordCustom === "true"
                },
                allowedUsersIDs: allowedUsersIDs || [],
                modsURLs
            };

            if (status === "waiting") {
                if (!waitingUntil) {
                    return res.status(400).json(createErrorResponse(
                        "[REACH - AInstances]: 'waitingUntil' is required when status is 'waiting'.",
                        400
                    ));
                }
                UInstanceNew = {    
                    ...commonFields,
                    status: "waiting",
                    waitingUntil: new Date(waitingUntil)
                };
            } else {
                UInstanceNew = {
                    ...commonFields,
                    status: status as Exclude<InstanceInformation["status"], "waiting">
                };
            }
        }

        await REACH_SDK_DB.insertDocument("instances", UInstanceNew);

        return res.status(201).json(createSuccessResponse(
            UInstanceNew,
            "[REACH - AInstances]: New instance created successfully."
        ));
    } catch (error) {
        console.error("[REACH - AInstances]: Error creating new instance:", error);
        return res.status(500).json(createErrorResponse(
            "[REACH - AInstances]: An error occurred while creating a new instance.",
            500
        ));
    }
}
  
async function createInstanceAssets(req: Request, res: Response) {
    try {
        const { name } = req.body;
        const NAME_PARSED = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        const REACH_UUID = uuidv4().slice(0, 8);
        const FILES_UPLOADED = req.files as Express.Multer.File[];

        if (!FILES_UPLOADED || FILES_UPLOADED.length === 0) {
            return res.status(400).json(createErrorResponse(
                "[REACH - AInstances]: No asset files were uploaded.",
                400
            ));
        }

        const ASSETS_DIR = path.join(multerDirSafe(), "instances", "assets");
        await fs.promises.mkdir(ASSETS_DIR, { recursive: true });

        const ASSETS_NAME_EDITED: string[] = [];

        for (const file of FILES_UPLOADED) {
            const originalExt = path.extname(file.originalname);
            const newName = `${REACH_UUID}_${NAME_PARSED}${originalExt.toLowerCase()}`;
            const finalPath = path.join(ASSETS_DIR, newName);

            await fs.promises.rename(file.path, finalPath);
            ASSETS_NAME_EDITED.push(newName);
        }

        const datapackResult = {
            id: REACH_UUID,
            name: name,
            assets: ASSETS_NAME_EDITED
        };

        return res.status(200).json(createSuccessResponse(
            datapackResult,
            `[REACH - AInstances]: Instance assets created successfully for ${name}.`
        ));

    } catch (error) {
        console.error("[REACH - AInstances]: Error creating instance assets:", error);
        return res.status(500).json(createErrorResponse(
            "[REACH - AInstances]: An error occurred while creating instance assets.",
            500
        ));
    }
}

async function configCloudSave(req: Request, res: Response) {
    
}

export { createNewInstance, createInstanceAssets };
