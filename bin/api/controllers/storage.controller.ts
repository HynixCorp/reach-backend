import fs from "fs";
import path from "path";
import { fromFile } from 'file-type';
import { config } from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { Request, Response } from "express";
import { MongoDB } from "../../common/mongodb/mondodb";
import { InstanceInformation } from "../../interfaces/instances";
import {
    createErrorResponse,
    createGenericResponse,
    createSuccessResponse,
    multerDirSafe,
    verifyPackageExists
} from "../../common/utils";
import { reach_packageDecompile } from "../../common/resourcesMe/packageDecompile";

config();

const REACH_SDK_DB = new MongoDB(process.env.DB_URI as string, "reach");

async function createNewInstance(req: Request, res: Response) {
    try {
        const {
            name,
            status,
            minClientVersion,
            thumbnailURI,
            logoURI,
            videos,
            isReachEnabled,
            isTestingEnabled,
            allowedUsersIDs,
            gameVersion,
            waitingUntil
        } = req.body;

        const uploadedFile = req.file;
        if (!uploadedFile) {
            return res.status(400).json(createErrorResponse(
                "[REACH-SDK - AInstances]: No instance package file was uploaded.",
                400
            ));
        }

        const fileType = await fromFile(uploadedFile.path);
        if (!fileType || fileType.ext !== 'zip' || fileType.mime !== 'application/zip') {
            await fs.promises.unlink(uploadedFile.path);
            return res.status(400).json(createErrorResponse(
                "[REACH-SDK - AInstances]: Uploaded file is not a valid ZIP archive.",
                400
            ));
        }

        const stats = await fs.promises.stat(uploadedFile.path);
        if (stats.size < 100) {
            await fs.promises.unlink(uploadedFile.path);
            return res.status(400).json(createErrorResponse(
                "[REACH-SDK - AInstances]: Uploaded ZIP file is too small or empty.",
                400
            ));
        }

        const size = uploadedFile.size.toString();

        // Validar campos obligatorios
        const requiredFields = [name, status, minClientVersion, thumbnailURI, logoURI, gameVersion];
        const hasAllFields = requiredFields.every(field => field !== undefined && field !== null);
        if (!hasAllFields) {
            return res.status(400).json(createErrorResponse(
                "[REACH-SDK - AInstances]: Missing required fields in the request body. Please ensure all required fields are provided.",
                400
            ));
        }

        const REACH_UUID = uuidv4();
        const NAME_PARSED = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        const MULTER_DIR = multerDirSafe();

        // Verificar existencia previa
        const existingInstance = await REACH_SDK_DB.findDocuments("instances", { name });
        if (existingInstance.length > 0) {
            return res.status(409).json(createGenericResponse(
                false,
                null,
                `Instance with name ${name} already exists.`,
                409
            ));
        }

        if (verifyPackageExists(NAME_PARSED)) {
            return res.status(409).json(createGenericResponse(
                false,
                null,
                `Instance package with name ${NAME_PARSED} already exists. Resend the request for create new Reach SDK UUID.`,
                409
            ));
        }

        // Guardar paquete zip
        const PACKAGE_DIR = path.join(MULTER_DIR, "instances", "packages");
        await fs.promises.mkdir(PACKAGE_DIR, { recursive: true });
        const finalPackagePath = path.join(PACKAGE_DIR, `${REACH_UUID}_${NAME_PARSED}.zip`);
        await fs.promises.rename(uploadedFile.path, finalPackagePath);

        // Decompile the package
        const decompileResult = await reach_packageDecompile(`${REACH_UUID}_${NAME_PARSED}.zip`);
        if (!decompileResult || !decompileResult.manifestPath) {
            return res.status(500).json(createErrorResponse(
                "[REACH-SDK - AInstances]: Failed to decompile the instance package.",
                500
            ));
        }

        //Delete the original zip file after decompilation
        await fs.promises.unlink(finalPackagePath);

        let UInstanceNew: InstanceInformation;

        if (status === "waiting") {
            if (!waitingUntil) {
                return res.status(400).json(createErrorResponse(
                    "[REACH-SDK - AInstances]: 'waitingUntil' field is required when status is 'waiting'.",
                    400
                ));
            }

            UInstanceNew = {
                id: REACH_UUID,
                name: NAME_PARSED,
                createdAt: new Date(),
                updatedAt: new Date(),
                currentVersion: "1.0.0",
                status: "waiting",
                size: parseInt(size, 10),
                packageManifest: decompileResult.manifestPath,
                application: {
                    minClientVersionRequired: minClientVersion || "latest",
                    thumbnail: thumbnailURI,
                    logo: logoURI,
                    videos,
                    gameVersion: gameVersion
                },
                options: {
                    isReachEnabled: isReachEnabled === "true",
                    isTestingEnabled: isTestingEnabled === "true"
                },
                allowedUsersIDs: allowedUsersIDs || [],
                waitingUntil: new Date(waitingUntil)
            };
        } else {
            UInstanceNew = {
                id: REACH_UUID,
                name: NAME_PARSED,
                createdAt: new Date(),
                updatedAt: new Date(),
                currentVersion: "1.0.0",
                status: status as Exclude<InstanceInformation["status"], "waiting">,
                size: parseInt(size, 10),
                packageManifest: decompileResult.manifestPath,
                application: {
                    minClientVersionRequired: minClientVersion || "latest",
                    thumbnail: thumbnailURI,
                    logo: logoURI,
                    videos,
                    gameVersion: gameVersion
                },
                options: {
                    isReachEnabled: isReachEnabled === "true",
                    isTestingEnabled: isTestingEnabled === "true"
                },
                allowedUsersIDs: allowedUsersIDs || []
            };
        }

        await REACH_SDK_DB.insertDocument("instances", UInstanceNew);

        return res.status(201).json(createSuccessResponse(
            UInstanceNew,
            "[REACH-SDK - AInstances]: New instance created successfully."
        ));
    } catch (error) {
        console.error("[REACH-SDK - AInstances]: Error creating new instance:", error);
        return res.status(500).json(createErrorResponse(
            "[REACH-SDK - AInstances]: An error occurred while creating a new instance.",
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
                "[REACH-SDK - AInstances]: No asset files were uploaded.",
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
            `[REACH-SDK - AInstances]: Instance assets created successfully for ${name}.`
        ));

    } catch (error) {
        console.error("[REACH-SDK - AInstances]: Error creating instance assets:", error);
        return res.status(500).json(createErrorResponse(
            "[REACH-SDK - AInstances]: An error occurred while creating instance assets.",
            500
        ));
    }
}

export { createNewInstance, createInstanceAssets };
