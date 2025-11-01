import "colorts/lib/string";
import cron from "node-cron";
import fs from "fs/promises";
import path from "path";
import { config } from "dotenv";
import { MongoDB } from "../common/mongodb/mongodb";

config();

const DB = new MongoDB(process.env.DB_URI as string, "reach");
const MAX_AGE_MS = 1000 * 60 * 60 * 48;

(async () => {
    await DB.connect();
})();

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
}

async function checkWaitingInstances() {
    const now = new Date();

    const waitingInstances = await DB.findDocuments("instances", {
        status: "waiting",
        waitingUntil: { $lte: now },
    });

    for (const instance of waitingInstances) {
        await DB.updateDocument("instances", { id: instance.id }, {
            status: "active",
        });

        const db = DB.getDb();
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

    const files = await fs.readdir(TEMP_DIR);

    for (const file of files) {
        const filePath = path.join(TEMP_DIR, file);
        try {
            const stats = await fs.stat(filePath);
            const age = now - stats.birthtimeMs;

            if (age > MAX_AGE_MS) {
                await fs.unlink(filePath);
                console.log(`[REACH - InstanceManager] Old .zip deleted: ${file}`.magenta);
            }
        } catch (err) {
            console.warn(`[REACH - InstanceManager] Cannot review/delete ${file}:`.red, err);
        }
    }
}