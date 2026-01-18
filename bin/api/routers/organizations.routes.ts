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
import { API_ROUTES } from "../../common/constants";

const ROUTER = express.Router();

/**
 * Organizations Routes
 * 
 * Manages developer organizations, team invites, and membership.
 * All routes require authentication.
 */

// Organization CRUD
ROUTER.post(API_ROUTES.ORGANIZATIONS.CREATE, asyncHandler(create_organization));
ROUTER.put(API_ROUTES.ORGANIZATIONS.UPDATE_ASSETS, asyncHandler(update_organization_assets));
ROUTER.put(API_ROUTES.ORGANIZATIONS.UPDATE_INFO, asyncHandler(edit_organization_info));

// Invite links management
ROUTER.post(API_ROUTES.ORGANIZATIONS.CREATE_LINK, asyncHandler(create_organization_link));
ROUTER.post(API_ROUTES.ORGANIZATIONS.RENEW_LINK, asyncHandler(renew_organization_link));
ROUTER.post(API_ROUTES.ORGANIZATIONS.DELETE_LINK, asyncHandler(revoke_organization_link));

// Join/Decline invites
ROUTER.post(API_ROUTES.ORGANIZATIONS.JOIN, asyncHandler(join_organization));
ROUTER.post(API_ROUTES.ORGANIZATIONS.DECLINE, asyncHandler(decline_invite));

// Member management
ROUTER.delete(API_ROUTES.ORGANIZATIONS.DELETE_MEMBER, asyncHandler(delete_member_from_organization));

// Get organization information
ROUTER.get(API_ROUTES.ORGANIZATIONS.GET_BY_USER, asyncHandler(get_organizations_by_user));
ROUTER.get(API_ROUTES.ORGANIZATIONS.GET_INFO_BY_LINK, asyncHandler(get_organization_info_by_tk));
ROUTER.get(API_ROUTES.ORGANIZATIONS.GET_INFO_BY_ID, asyncHandler(get_organization_info_by_id));
ROUTER.get(API_ROUTES.ORGANIZATIONS.GET_ALL_INFO, asyncHandler(get_all_info_organization));

export { ROUTER as ORGANIZATIONS_ROUTER };
export default ROUTER;