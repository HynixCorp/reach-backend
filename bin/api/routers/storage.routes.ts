// storage.routes.ts
import express from "express";
import { tempUpload } from "../../common/multer/multer.temp";
const CONTROLLER = require("../controllers/storage.controller");

const ROUTER = express.Router();

ROUTER.post("/instance/new", tempUpload.single("package"), CONTROLLER.createNewInstance);
ROUTER.post("/instance/assets/new", tempUpload.array("assets", 2), CONTROLLER.createInstanceAssets);

export { ROUTER as STORAGE_ROUTER };
