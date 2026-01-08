import "colorts/lib/string";
import cron from "node-cron";
import path from "path";
import fs from "fs/promises";
import { pathExists } from "fs-extra";
import { multerDirSafe } from "../common/utils";

const SCHEDULE_EVERY_TEN_MINUTES = "*/10 * * * *";
const ttlFromEnv = Number(process.env.TEMP_FILE_TTL_MINUTES);
const RESOLVED_TTL_MINUTES = Number.isFinite(ttlFromEnv) && ttlFromEnv > 0 ? ttlFromEnv : 10;
const STALE_FILE_AGE_MS = RESOLVED_TTL_MINUTES * 60_000;
const TEMP_DIR = path.join(multerDirSafe(), "temp");

let isRunning = false;

async function removeStaleTempFiles(): Promise<void> {
  const exists = await pathExists(TEMP_DIR);
  if (!exists) {
    return;
  }

  const entries = await fs.readdir(TEMP_DIR);
  const now = Date.now();

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(TEMP_DIR, entry);

      try {
        const stats = await fs.stat(entryPath);
        if (stats.isDirectory()) {
          return;
        }

        const ageMs = now - stats.mtimeMs;
        if (ageMs < STALE_FILE_AGE_MS) {
          return;
        }

        // Skip files that may still be in use by trying to open them for reading.
        let handle;
        try {
          handle = await fs.open(entryPath, "r");
        } catch (error) {
          return;
        } finally {
          await handle?.close();
        }

        await fs.unlink(entryPath);
        console.log(`[REACHX - Falcon] Deleted stale temp file: ${entry}`.cyan);
      } catch (error) {
        console.warn(
          `[REACHX - Falcon] Failed to evaluate temp entry ${entry}:`.yellow,
          error
        );
      }
    })
  );
}

export function startTempCleaner(): void {
  cron.schedule(SCHEDULE_EVERY_TEN_MINUTES, async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;
    try {
      await removeStaleTempFiles();
    } catch (error) {
      console.error("[REACHX - Falcon] Cleanup task failed:".red, error);
    } finally {
      isRunning = false;
    }
  });

  console.log("[REACHX - Falcon] Scheduled temp directory cleanup every 10 minutes.".green);
}
