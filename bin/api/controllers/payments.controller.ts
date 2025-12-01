import { Request, Response } from "express";
import { config } from "dotenv";
import {
  createErrorResponse,
  createGenericResponse,
  createSuccessResponse,
} from "../../common/utils";
import { PolarOrderDB } from "../../types/polar";
import {
  getCheckoutInfo,
  getCustomerID,
  getCustomerPortalURL,
} from "../../common/polar/utils";
import { cryptManager } from "../../common/cryptography/cesar";
import {
  createNewUsageDocument,
  getUsageDocument,
} from "../../common/reach/usage";
import { getReachDB, getReachAuthDB } from "../../common/services/database.service";
import { nanoid } from "nanoid";
import { resendService } from "../../common/resend/service";
import { buildInvoiceEmail } from "../../common/resend/templates/invoiceTemplate";

config();

const REACH_KEYWORD = process.env.CRYPTO_SECRET;
const REACH_DB = getReachDB();
const REACH_AUTH_DB = getReachAuthDB();
const REACH_CRYPT = cryptManager.start();

function parsePlan(productID: string) {
  let key: "hobby" | "standard" | "pro" | null;

  const allowedPaymentIDs = [
    "c0598bff-8486-4888-bfba-c038ab207031",
    "fb97ea5c-b2ae-422d-b217-c57d752911fa",
    "2fbe7c28-8535-413d-8242-fb896ef4aa87",
  ];

  switch (productID) {
    case allowedPaymentIDs[0]:
      key = "hobby";
      break;
    case allowedPaymentIDs[1]:
      key = "standard";
      break;
    case allowedPaymentIDs[2]:
      key = "pro";
      break;
    default:
      key = null;
      break;
  }

  return key;
}

function formatAddress(address?: {
  line1: string | null;
  line2: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}): string | undefined {
  if (!address) {
    return undefined;
  }

  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(", "),
    address.postal_code,
    address.country,
  ].filter((segment) => Boolean(segment && segment.toString().trim().length > 0));

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(", ");
}

function formatDateLabel(dateValue: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateValue);
}

export async function success_payment(req: Request, res: Response) {
  const { checkoutId, customer_session_token } = req.query;

  if (!checkoutId || !customer_session_token) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: Checkout ID or customer session token is missing.",
          400
        )
      );
  }
  const checkoutInfo = await getCheckoutInfo(checkoutId as string);
  const productID = checkoutInfo.products[0].id;

  if (checkoutInfo.customer_external_id === null) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: Customer external ID is missing. Please contact support.",
          400
        )
      );
  }

  const order: PolarOrderDB = {
    checkoutId: checkoutId as string,
    customerSessionToken: await REACH_CRYPT.encrypt(
      customer_session_token as string,
      REACH_KEYWORD as string
    ),
    products: [productID],
    fristDate: new Date(),
    paymentDate: new Date(),
    endDate: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
    betterAuthId: checkoutInfo.customer_external_id as string,
    status: "active",
    plan: parsePlan(productID),
    subscriptionId: checkoutInfo.subscription_id,
  };

  let result;
  try {
    result = await REACH_DB.insertDocument("payments", order);
  } catch (error) {
    console.error("[REACH - Payments]: Error inserting order:", error);
    return res
      .status(500)
      .json(
        createErrorResponse(
          "[REACH - Payments]: Failed to insert order into database. Please contact support.",
          500
        )
      );
  }

  if (!result || !result.acknowledged) {
    return res
      .status(500)
      .json(
        createErrorResponse(
          "[REACH - Payments]: Failed to insert order into database. Please contact support.",
          500
        )
      );
  }

  const _udoc = createNewUsageDocument(order);

  if (!_udoc) {
    console.warn(
      `[REACH - Payments]: Failed to create usage document. Invalid plan for product ID: ${productID}`
    );
  } else {
    try {
      const result_usage = await REACH_AUTH_DB.insertDocument("usage", {
        auth: checkoutInfo.customer_external_id as string,
        _udoc,
      });

      if (!result_usage || !result_usage.acknowledged) {
        throw new Error("Failed to acknowledge usage insertion.");
      }
    } catch (error) {
      console.error("[REACH - Payments]: Error inserting usage document:", error);
      return res
        .status(500)
        .json(
          createErrorResponse(
            "[REACH - Payments]: Failed to insert usage information into database. Please contact support.",
            500
          )
        );
    }
  }

  const currencyCode = (checkoutInfo.currency || checkoutInfo.product_price?.price_currency || "USD").toUpperCase();
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  });
  const invoiceNumber = `INV-${nanoid(6).toUpperCase()}`;
  const quantity = 1;
  const rateMinorUnits = checkoutInfo.product_price?.price_amount ?? checkoutInfo.total_amount;
  const totalMinorUnits = checkoutInfo.total_amount;
  const rateValue = rateMinorUnits / 100;
  const totalValue = totalMinorUnits / 100;
  const clientDisplayName = checkoutInfo.customer_name || checkoutInfo.customer_billing_name || checkoutInfo.customer_email;
  const issuedOnLabel = formatDateLabel(order.paymentDate);
  const dueOnLabel = formatDateLabel(order.endDate);
  const clientAddress = formatAddress(checkoutInfo.customer_billing_address);
  const serviceLabel = checkoutInfo.product?.name || "Reach Subscription";

  const invoiceHTML = buildInvoiceEmail({
    invoiceNumber,
    issuedOn: issuedOnLabel,
    paymentDue: dueOnLabel,
    clientName: clientDisplayName,
    clientEmail: checkoutInfo.customer_email,
    clientAddress,
    currencyCode,
    subtotalFormatted: formatter.format(totalValue),
    totalFormatted: formatter.format(totalValue),
    lineItems: [
      {
        description: serviceLabel,
        quantity,
        rateFormatted: formatter.format(rateValue),
        totalFormatted: formatter.format(totalValue),
      },
    ],
  });

  try {
    await resendService.sendEmail(
      checkoutInfo.customer_email,
      `Invoice ${invoiceNumber}`,
      invoiceHTML
    );
  } catch (emailError) {
    console.error("[REACH - Payments]: Failed to send invoice email.", emailError);
  }

  res.redirect(
    `${process.env.DASHBOARD_URL || "https://dashboard.reachsdk.online/"}`
  );
  return;
}

export async function cancel_payment(req: Request, res: Response) {
  console.log("Cancel payment: ", req.query);
}

export async function create_portal(req: Request, res: Response) {
  const { baId } = req.query;

  if (!baId) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: BA-ID is missing. Please contact support.",
          400
        )
      );
  }

  const order: PolarOrderDB[] = await REACH_DB.findDocuments("payments", {
    betterAuthId: baId as string,
  });

  if (order.length === 0) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: No active subscription found for this user. Please contact support.",
          400
        )
      );
  }

  if (order[0].status === "expired") {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: No active subscription found for this user. Please contact support.",
          400
        )
      );
  }

  const customerSessionToken = await REACH_CRYPT.decrypt(
    order[0].customerSessionToken,
    REACH_KEYWORD as string
  );
  const customerID = await getCustomerID(customerSessionToken);
  if (customerID === null) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: Failed to get customer ID. Please contact support.",
          400
        )
      );
  }
  const customerPortalURL = await getCustomerPortalURL(customerID.id);

  res.redirect(customerPortalURL.customer_portal_url);
}

export async function get_payment_info(req: Request, res: Response) {
  const { baId } = req.query;

  if (!baId) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: BA-ID is missing. Please contact support.",
          400
        )
      );
  }

  const order: PolarOrderDB[] = await REACH_DB.findDocuments("payments", {
    betterAuthId: baId as string,
  });

  if (order.length === 0) {
    return res
      .status(200)
      .json(
        createGenericResponse(
          false,
          [],
          "[REACH - Payments]: No active subscription found for this user. Purchase a new subscription to continue.",
          200
        )
      );
  }

  const paymentInfo = order[0];
  paymentInfo.customerSessionToken = null as unknown as string;

  return res
    .status(200)
    .json(
      createSuccessResponse(paymentInfo, "Payment info fetched successfully.")
    );
}

export async function get_usage(req: Request, res: Response) {
  const { baId } = req.query;

  if (!baId) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "[REACH - Payments]: BA-ID is missing. Please contact support.",
          400
        )
      );
  }

  const document = await getUsageDocument(baId as string);

  if (!document) {
    return res
      .status(200)
      .json(
        createGenericResponse(
          false,
          [],
          "[REACH - Payments/Order]: This document not exists or is unavailable.",
          200
        )
      );
  }

  document.auth = "";

  return res
    .status(200)
    .json(createSuccessResponse(document, "Usage info fetched successfully."));
}
