import { Checkout, CustomerPortal, Webhooks } from "@polar-sh/express";
import express from "express";
import { config } from "dotenv";
import { asyncHandler } from "../../common/services/response.service";
import { 
  success_payment, 
  cancel_payment, 
  create_portal, 
  get_payment_info, 
  get_usage 
} from "../controllers/payments.controller";
import { handlePolarPayload } from "../controllers/webhooks.controller";

config();

const POLAR_TOKEN = process.env.POLAR_API_KEY;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

const ROUTER = express.Router();

ROUTER.get("/create", Checkout({
    accessToken: POLAR_TOKEN,
    successUrl: `${process.env.BASE_URL}/api/payments/v0/success`,
    includeCheckoutId: true,
    server: "sandbox",
    theme: "dark"
})); 

ROUTER.get("/success", asyncHandler(success_payment));
ROUTER.get("/cancel", asyncHandler(cancel_payment));
ROUTER.get("/create/portal", asyncHandler(create_portal));
ROUTER.get("/info", asyncHandler(get_payment_info));
ROUTER.get("/usage/info", asyncHandler(get_usage));

ROUTER.post("/webhook", Webhooks({
    webhookSecret: POLAR_WEBHOOK_SECRET || "",
    onPayload: handlePolarPayload,
}));

export { ROUTER as PAYMENTS_ROUTER };
export default ROUTER;