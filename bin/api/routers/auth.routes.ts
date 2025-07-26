import express from "express";

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/auth.controller");

ROUTER.post("/create", CONTROLLER.createNewUserData);
ROUTER.get("/get", CONTROLLER.getUserData);

export { ROUTER as AUTH_ROUTER };
export default ROUTER;