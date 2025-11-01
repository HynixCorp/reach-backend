import express from "express";
import { config } from "dotenv";

config();

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/organizations.controller");

ROUTER.post("/create", CONTROLLER.create_organization);
ROUTER.post("/create/link", CONTROLLER.create_organization_link);
ROUTER.post("/join", CONTROLLER.join_organization);
ROUTER.post("/decline", CONTROLLER.decline_invite);
ROUTER.post(("/renew/link"), CONTROLLER.renew_organization_link);
ROUTER.post("/delete/link", CONTROLLER.revoke_organization_link);
ROUTER.put("/update/assets", CONTROLLER.update_organization_assets);
ROUTER.put("/update/information", CONTROLLER.edit_organization_info);
ROUTER.get("/user/:userId", CONTROLLER.get_organizations_by_user);
ROUTER.get("/information/link/:key", CONTROLLER.get_organization_info_by_tk);
ROUTER.get("/information/:organizationId/:executor", CONTROLLER.get_organization_info_by_id);
ROUTER.get("/information", CONTROLLER.get_all_info_organization);

export { ROUTER as ORGANIZATIONS_ROUTER };
export default ROUTER;