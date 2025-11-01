// storage.routes.ts
import express from "express";
import { createInstanceHandler, createManifestSignature } from "../controllers/storage.controller";
import { instanceUploadFields } from "../../common/multer/multer.instances";

const router = express.Router();

router.post("/instances", instanceUploadFields, createInstanceHandler);
router.get("/:instanceId/manifest", createManifestSignature)

export default router;