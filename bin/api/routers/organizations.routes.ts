import express from "express";
import { config } from "dotenv";

config();

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/organizations.controller");

ROUTER.post("/create", CONTROLLER.create_organization);
ROUTER.post("/create/link", CONTROLLER.create_organization_link);

export { ROUTER as ORGANIZATIONS_ROUTER };
export default ROUTER;