import express from "express";
import { asyncHandler } from "../../common/services/response.service";
import { 
  getAllMarketplaceItems,
  getMarketplaceMain
} from "../controllers/marketplace.controller";

const ROUTER = express.Router();

ROUTER.get("/manifest/get", asyncHandler(getMarketplaceMain));
ROUTER.get("/items/all", asyncHandler(getAllMarketplaceItems));

export { ROUTER as MARKETPLACE_ROUTER };
export default ROUTER;