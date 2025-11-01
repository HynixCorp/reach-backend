// bin/common/multer.instances.ts
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { multerDirSafe } from "../utils";

const temp = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmp = path.join(multerDirSafe(), "temp");
    fs.mkdirpSync(tmp);
    cb(null, tmp);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

export const tempUpload = multer({ storage: temp });

// For single-route usage you can use .fields([...])
export const instanceUploadFields = tempUpload.fields([
  { name: "assetsImages", maxCount: 6 },
  { name: "assetsVideos", maxCount: 2 },
  { name: "experienceFile", maxCount: 1 }
]);
