import { Checkout, CustomerPortal, Webhooks } from "@polar-sh/express";
import express from "express";
import { config } from "dotenv";

config();

const POLAR_TOKEN = process.env.POLAR_API_KEY;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

const ROUTER = express.Router();
const CONTROLLER = require("../controllers/payments.controller");
const WEBHOOKS_CONTROLLER = require("../controllers/webhooks.controller");

ROUTER.get("/create", Checkout({
    accessToken: POLAR_TOKEN,
    successUrl: `${process.env.BASE_URL}/api/payments/v0/success`,
    includeCheckoutId: true,
    server: "sandbox",
    theme: "dark"
})); 

ROUTER.get("/success", CONTROLLER.success_payment);

ROUTER.get("/cancel", CONTROLLER.cancel_payment);

ROUTER.get("/create/portal", CONTROLLER.create_portal);

ROUTER.get("/info", CONTROLLER.get_payment_info);

ROUTER.get("/usage/info", CONTROLLER.get_usage);

// ROUTER.get("/portal", CustomerPortal({
//     accessToken: POLAR_TOKEN,
//     getCustomerId: async (req) => {
//         return "123";
//     },
//     server: "sandbox"
// }));

ROUTER.post("/webhook", Webhooks({
    webhookSecret: POLAR_WEBHOOK_SECRET || "",
    onPayload: WEBHOOKS_CONTROLLER.handlePolarPayload,
}));

export { ROUTER as PAYMENTS_ROUTER };
export default ROUTER;