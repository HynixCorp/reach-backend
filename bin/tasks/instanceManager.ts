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
            console.error("[REACH - InstanceManager] Error in the automatic task schedule:".red, err);
        }
    });
    
    // Run version cleanup every 6 hours
    cron.schedule("0 */6 * * *", async () => {
        try {
            console.log("[REACH - InstanceManager] Starting global version cleanup...".cyan);
            await cleanInstanceVersionsGlobal();
        } catch (err) {
            console.error("[REACH - InstanceManager] Error in version cleanup task:".red, err);
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

        console.log(`[REACH - InstanceManager] Updated pending instance: ${instance.name} (${instance.id})`.green);
    }
}

// async function cleanUnusedAssets() {
//     const now = Date.now();

//     const allInstances = await DB.findDocuments("instances");
//     const usedFiles = new Set<string>();

//     for (const instance of allInstances) {
//         const app = instance.application || {};
//         if (app.thumbnail) usedFiles.add(app.thumbnail);
//         if (app.logo) usedFiles.add(app.logo);
//     }

//     const allFiles = await fs.readdir(ASSETS_DIR);

//     for (const file of allFiles) {
//         if (usedFiles.has(file)) continue;

//         const filePath = path.join(ASSETS_DIR, file);
//         try {
//             const stats = await fs.stat(filePath);
//             const age = now - stats.birthtimeMs;

//             if (age > MAX_AGE_MS) {
//                 await fs.unlink(filePath);
//                 console.log(`[REACH - InstanceManager] Unused asset deleted (old): ${file}`.yellow);
//             }
//         } catch (err) {
//             console.warn(`[REACH - InstanceManager] Could not be deleted ${file}:`.red, err);
//         }
//     }
// }

async function cleanOldTempFiles() {
    const now = Date.now();
    let files: string[] = [];
    try {
        files = await fs.readdir(TEMP_DIR);
    } catch (err: any) {
        console.warn(`[REACH - InstanceManager] Could not read temp dir ${TEMP_DIR}:`.red, err);
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
                console.warn(`[REACH - InstanceManager] Could not stat ${file}:`.red, statErr);
                continue;
            }

            const age = now - stats.birthtimeMs;

            if (age > MAX_AGE_MS) {
                try {
                    await fs.unlink(filePath);
                    console.log(`[REACH - InstanceManager] Old .zip deleted: ${file}`.magenta);
                } catch (unlinkErr: any) {
                    // If the file was removed between stat and unlink, ignore it.
                    if (unlinkErr && unlinkErr.code === 'ENOENT') continue;
                    console.warn(`[REACH - InstanceManager] Failed to delete ${file}:`.red, unlinkErr);
                }
            }
        } catch (err) {
            console.warn(`[REACH - InstanceManager] Cannot review/delete ${file}:`.red, err);
        }
    }
}

async function cleanInstanceVersionsGlobal() {
    try {
        await cleanOldVersionsGlobal();
        console.log("[REACH - InstanceManager] Version cleanup completed successfully".green);
    } catch (err) {
        console.error("[REACH - InstanceManager] Error in cleanInstanceVersionsGlobal:".red, err);
    }
}