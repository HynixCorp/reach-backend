import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import { get_status } from "../controllers/athenas.controller";

const ROUTER = express.Router();

ROUTER.get("/get", asyncHandler(get_status));

export { ROUTER as ATHENAS_ROUTER };
export default ROUTER;