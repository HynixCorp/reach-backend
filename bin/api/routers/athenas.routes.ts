import express from "express";

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/athenas.controller");

ROUTER.get("/get", CONTROLLER.get_status);

export { ROUTER as ATHENAS_ROUTER };
export default ROUTER;