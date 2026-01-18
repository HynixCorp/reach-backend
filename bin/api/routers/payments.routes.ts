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
import { API_ROUTES } from "../../common/constants";

config();

const POLAR_TOKEN = process.env.POLAR_API_KEY;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

const ROUTER = express.Router();

/**
 * Payments Routes
 * 
 * Handles Polar.sh payment integration for developer subscriptions.
 */

// Polar checkout (redirects to Polar)
ROUTER.get(API_ROUTES.PAYMENTS.CREATE, Checkout({
    accessToken: POLAR_TOKEN,
    successUrl: `${process.env.BASE_URL}${API_ROUTES.PAYMENTS.BASE}${API_ROUTES.PAYMENTS.SUCCESS}`,
    includeCheckoutId: true,
    server: "sandbox",
    theme: "dark"
})); 

// Payment callbacks
ROUTER.get(API_ROUTES.PAYMENTS.SUCCESS, asyncHandler(success_payment));
ROUTER.get(API_ROUTES.PAYMENTS.CANCEL, asyncHandler(cancel_payment));

// Customer portal
ROUTER.get(API_ROUTES.PAYMENTS.CREATE_PORTAL, asyncHandler(create_portal));

// Payment/subscription info
ROUTER.get(API_ROUTES.PAYMENTS.INFO, asyncHandler(get_payment_info));

// Usage statistics
ROUTER.get(API_ROUTES.PAYMENTS.USAGE_INFO, asyncHandler(get_usage));

// Polar webhook
ROUTER.post(API_ROUTES.PAYMENTS.WEBHOOK, Webhooks({
    webhookSecret: POLAR_WEBHOOK_SECRET || "",
    onPayload: handlePolarPayload,
}));

export { ROUTER as PAYMENTS_ROUTER };
export default ROUTER;