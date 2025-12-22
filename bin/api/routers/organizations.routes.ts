import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import {
  create_organization,
  create_organization_link,
  join_organization,
  decline_invite,
  renew_organization_link,
  revoke_organization_link,
  update_organization_assets,
  edit_organization_info,
  get_organizations_by_user,
  get_organization_info_by_tk,
  get_organization_info_by_id,
  get_all_info_organization,
  delete_member_from_organization,
} from "../controllers/organizations.controller";

const ROUTER = express.Router();

ROUTER.post("/create", asyncHandler(create_organization));
ROUTER.post("/create/link", asyncHandler(create_organization_link));
ROUTER.post("/join", asyncHandler(join_organization));
ROUTER.post("/decline", asyncHandler(decline_invite));
ROUTER.post("/renew/link", asyncHandler(renew_organization_link));
ROUTER.post("/delete/link", asyncHandler(revoke_organization_link));
ROUTER.put("/update/assets", asyncHandler(update_organization_assets));
ROUTER.put("/update/information", asyncHandler(edit_organization_info));
ROUTER.delete("/member", asyncHandler(delete_member_from_organization));
ROUTER.get("/user/:userId", asyncHandler(get_organizations_by_user));
ROUTER.get("/information/link/:key", asyncHandler(get_organization_info_by_tk));
ROUTER.get("/information/:organizationId/:executor", asyncHandler(get_organization_info_by_id));
ROUTER.get("/information", asyncHandler(get_all_info_organization));

export { ROUTER as ORGANIZATIONS_ROUTER };
export default ROUTER;