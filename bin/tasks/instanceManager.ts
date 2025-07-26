import "colorts/lib/string";
import cron from "node-cron";
import fs from "fs/promises";
import path from "path";
import { config } from "dotenv";
import { MongoDB } from "../common/mongodb/mondodb";

config();

const DB = new MongoDB(process.env.DB_URI as string, "reach");
const MAX_AGE_MS = 1000 * 60 * 60 * 48; // 48 horas

(async () => {
    await DB.connect();
})();

const ASSETS_DIR = path.join(__dirname, "..", "..", "files", "uploads", "instances", "assets");
const TEMP_DIR = path.join(__dirname, "..", "..", "files", "uploads", "temp");

export function startInstanceManager() {
    console.log("[REACH-SDK - InstanceManager] Tareas programadas activadas cada minuto.".cyan);

    cron.schedule("* * * * *", async () => {
        try {
            await checkWaitingInstances();
            // await cleanUnusedAssets();
            await cleanOldTempFiles();
        } catch (err) {
            console.error("[REACH-SDK - InstanceManager] Error general:".red, err);
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

        console.log(`[REACH-SDK - InstanceManager] Activada: ${instance.name} (${instance.id})`.green);
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
//                 console.log(`[REACH-SDK - InstanceManager] Eliminado asset no usado (antiguo): ${file}`.yellow);
//             } else {
//                 console.log(`[REACH-SDK - InstanceManager] Archivo ${file} es demasiado reciente, no se elimina`.blue);
//             }
//         } catch (err) {
//             console.warn(`[REACH-SDK - InstanceManager] No se pudo eliminar ${file}:`.red, err);
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
                console.log(`[REACH-SDK - InstanceManager] .zip antiguo eliminado: ${file}`.magenta);
            } else {
                console.log(`[REACH-SDK - InstanceManager] Archivo .zip ${file} es demasiado reciente, no se elimina`.blue);
            }
        } catch (err) {
            console.warn(`[REACH-SDK - InstanceManager] No se pudo revisar/borrar ${file}:`.red, err);
        }
    }
}