import "colorts/lib/string";
import cron from "node-cron";
import fs from "fs/promises";
import path from "path";
import { config } from "dotenv";
import { getExperiencesDB } from "../common/services/database.service";
import { cleanOldVersionsGlobal } from "../api/controllers/storage.controller";

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
            console.error("[REACHX - InstanceManager] Error in the automatic task schedule:".red, err);
        }
    });
    
    // Run version cleanup every 6 hours
    cron.schedule("0 */6 * * *", async () => {
        try {
            console.log("[REACHX - InstanceManager] Starting global version cleanup...".cyan);
            await cleanInstanceVersionsGlobal();
        } catch (err) {
            console.error("[REACHX - InstanceManager] Error in version cleanup task:".red, err);
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

        console.log(`[REACHX - InstanceManager] Updated pending instance: ${instance.name} (${instance.id})`.green);
    }
}

async function cleanOldTempFiles() {
    const now = Date.now();
    let files: string[] = [];
    try {
        files = await fs.readdir(TEMP_DIR);
    } catch (err: any) {
        console.warn(`[REACHX - InstanceManager] Could not read temp dir ${TEMP_DIR}:`.red, err);
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
                console.warn(`[REACHX - InstanceManager] Could not stat ${file}:`.red, statErr);
                continue;
            }

            const age = now - stats.birthtimeMs;

            if (age > MAX_AGE_MS) {
                try {
                    await fs.unlink(filePath);
                    console.log(`[REACHX - InstanceManager] Old .zip deleted: ${file}`.magenta);
                } catch (unlinkErr: any) {
                    // If the file was removed between stat and unlink, ignore it.
                    if (unlinkErr && unlinkErr.code === 'ENOENT') continue;
                    console.warn(`[REACHX - InstanceManager] Failed to delete ${file}:`.red, unlinkErr);
                }
            }
        } catch (err) {
            console.warn(`[REACHX - InstanceManager] Cannot review/delete ${file}:`.red, err);
        }
    }
}

async function cleanInstanceVersionsGlobal() {
    try {
        await cleanOldVersionsGlobal();
        console.log("[REACHX - InstanceManager] Version cleanup completed successfully".green);
    } catch (err) {
        console.error("[REACHX - InstanceManager] Error in cleanInstanceVersionsGlobal:".red, err);
    }
}