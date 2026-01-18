import cron from "node-cron";
import fs from "fs/promises";
import path from "path";
import { config } from "dotenv";
import { getExperiencesDB } from "../common/services/database.service";
import { cleanOldVersionsGlobal } from "../api/controllers/storage.controller";
import { logger } from "../common/services/logger.service";

config();

const MAX_AGE_MS = 1000 * 60 * 60 * 48;

// const ASSETS_DIR = path.join(__dirname, "..", "..", "files", "uploads", "instances", "assets");
const TEMP_DIR = path.join(__dirname, "..", "..", "cdn", "temp");

export function startInstanceManager() {
    cron.schedule("* * * * *", async () => {
        try {
            await checkWaitingInstances();
            // await cleanUnusedAssets();
            await cleanOldTempFiles();
        } catch (err) {
            logger.error("InstanceManager", `Error in the automatic task schedule: ${err}`);
        }
    });
    
    // Run version cleanup every 6 hours
    cron.schedule("0 */6 * * *", async () => {
        try {
            logger.info("InstanceManager", "Starting global version cleanup...");
            await cleanInstanceVersionsGlobal();
        } catch (err) {
            logger.error("InstanceManager", `Error in version cleanup task: ${err}`);
        }
    });
}

async function checkWaitingInstances() {
    const now = new Date();
    const experiencesDB = getExperiencesDB();

    const waitingInstances = await experiencesDB.findDocuments("instances", {
        status: "waiting",
        waitingUntil: { $lte: now },
    });

    for (const instance of waitingInstances) {
        await experiencesDB.updateDocument("instances", { id: instance.id }, {
            status: "active",
        });

        const db = experiencesDB.getDb();
        await db.collection("instances").updateOne(
            { id: instance.id },
            { $unset: { waitingUntil: "" } }
        );

        logger.info("InstanceManager", `Updated pending instance: ${instance.name} (${instance.id})`);
    }
}

async function cleanOldTempFiles() {
    const now = Date.now();
    let files: string[] = [];
    try {
        // Ensure temp directory exists before reading
        await fs.mkdir(TEMP_DIR, { recursive: true });
        files = await fs.readdir(TEMP_DIR);
    } catch (err: any) {
        logger.warn("InstanceManager", `Could not read temp dir ${TEMP_DIR}: ${err}`);
        return;
    }

    for (const file of files) {
        const filePath = path.join(TEMP_DIR, file);
        try {
            let stats;
            try {
                stats = await fs.stat(filePath);
            } catch (statErr: any) {
                // File might have been removed by another process (TempCleaner). Ignore ENOENT.
                if (statErr && statErr.code === "ENOENT") continue;
                logger.warn("InstanceManager", `Could not stat ${file}: ${statErr}`);
                continue;
            }

            const age = now - stats.birthtimeMs;

            if (age > MAX_AGE_MS) {
                try {
                    await fs.unlink(filePath);
                    logger.debug("InstanceManager", `Old .zip deleted: ${file}`);
                } catch (unlinkErr: any) {
                    // If the file was removed between stat and unlink, ignore it.
                    if (unlinkErr && unlinkErr.code === 'ENOENT') continue;
                    logger.warn("InstanceManager", `Failed to delete ${file}: ${unlinkErr}`);
                }
            }
        } catch (err) {
            logger.warn("InstanceManager", `Cannot review/delete ${file}: ${err}`);
        }
    }
}

async function cleanInstanceVersionsGlobal() {
    try {
        await cleanOldVersionsGlobal();
        logger.info("InstanceManager", "Version cleanup completed successfully");
    } catch (err) {
        logger.error("InstanceManager", `Error in cleanInstanceVersionsGlobal: ${err}`);
    }
}