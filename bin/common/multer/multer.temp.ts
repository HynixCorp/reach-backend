// src/common/multer.temp.ts
import multer from "multer";
import path from "path";
import fs from "fs";
import { multerDirSafe } from "../utils";

const tempDir = path.join(multerDirSafe(), "temp");

fs.mkdirSync(tempDir, { recursive: true });

export const tempUpload = multer({
    dest: tempDir
});
