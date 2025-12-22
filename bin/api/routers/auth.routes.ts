import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import { createNewUserData, getUserData, setupComplete } from "../controllers/auth.controller";

const ROUTER = express.Router();

ROUTER.post("/create", asyncHandler(createNewUserData));
ROUTER.get("/get", asyncHandler(getUserData));
ROUTER.get("/setup/finish", asyncHandler(setupComplete));

export { ROUTER as AUTH_ROUTER };
export default ROUTER;