import { Request, Response } from "express";
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
  formatAddress,
  formatDateLabel,
  parsePlan,
} from "../../common/polar/utils";
import { cryptManager } from "../../common/cryptography/cesar";
import {
  createNewUsageDocument,
  getUsageDocument,
} from "../../common/reach/usage";
import { getDevelopersDB } from "../../common/services/database.service";
import { nanoid } from "nanoid";
import { resendService } from "../../common/resend/service";
import { buildInvoiceEmail } from "../../common/resend/templates/invoiceTemplate";
import { validateRequest } from "../../common/services/validation.service";
import { ResponseHandler } from "../../common/services/response.service";

const REACH_KEYWORD = process.env.CRYPTO_SECRET;
// reach_developers - Payments and usage belong to developer accounts
const DEVELOPERS_DB = getDevelopersDB();
const REACH_CRYPT = cryptManager.start();

export async function success_payment(req: Request, res: Response) {
  const validation = validateRequest(req, {
    requiredQuery: ["checkoutId", "customer_session_token"],
  });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { checkoutId, customer_session_token } = req.query;
  const checkoutInfo = await getCheckoutInfo(checkoutId as string);
  const productID = checkoutInfo.products[0].id;

  if (checkoutInfo.customer_external_id === null) {
    return ResponseHandler.badRequest(
      res,
      "Customer external ID is missing. Please contact support."
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
    endDate: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
    betterAuthId: checkoutInfo.customer_external_id as string,
    status: "active",
    plan: parsePlan(productID),
    subscriptionId: checkoutInfo.subscription_id,
  };

  const result = await DEVELOPERS_DB.insertDocument("payments", order);

  if (!result?.acknowledged) {
    return ResponseHandler.serverError(
      res,
      "Failed to insert order into database. Please contact support."
    );
  }

  const _udoc = createNewUsageDocument(order);

  if (_udoc) {
    const result_usage = await DEVELOPERS_DB.insertDocument("usage", {
      auth: checkoutInfo.customer_external_id as string,
      _udoc,
    });

    if (!result_usage?.acknowledged) {
      return ResponseHandler.serverError(
        res,
        "Failed to insert usage information into database. Please contact support."
      );
    }
  }

  // Send invoice email
  const currencyCode = (
    checkoutInfo.currency ||
    checkoutInfo.product_price?.price_currency ||
    "USD"
  ).toUpperCase();
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  });
  const invoiceNumber = `INV-${nanoid(6).toUpperCase()}`;
  const rateMinorUnits =
    checkoutInfo.product_price?.price_amount ?? checkoutInfo.total_amount;
  const totalMinorUnits = checkoutInfo.total_amount;
  const rateValue = rateMinorUnits / 100;
  const totalValue = totalMinorUnits / 100;
  const clientDisplayName =
    checkoutInfo.customer_name ||
    checkoutInfo.customer_billing_name ||
    checkoutInfo.customer_email;
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
        quantity: 1,
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
    console.error("[REACHX - Payments]: Failed to send invoice email.", emailError);
  }

  res.redirect(
    `${process.env.DASHBOARD_URL || "https://dashboard.reachsdk.online/"}`
  );
}

export async function cancel_payment(req: Request, res: Response) {
  // TODO: Implement cancel payment logic
  console.log("Cancel payment: ", req.query);
  return res.status(200).json(createSuccessResponse(null, "Payment cancelled"));
}

export async function create_portal(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredQuery: ["baId"] });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { baId } = req.query;

  const order: PolarOrderDB[] = await DEVELOPERS_DB.findDocuments("payments", {
    betterAuthId: baId as string,
  });

  if (order.length === 0 || order[0].status === "expired") {
    return ResponseHandler.badRequest(
      res,
      "No active subscription found for this user. Please contact support."
    );
  }

  const customerSessionToken = await REACH_CRYPT.decrypt(
    order[0].customerSessionToken,
    REACH_KEYWORD as string
  );
  const customerID = await getCustomerID(customerSessionToken);

  if (customerID === null) {
    return ResponseHandler.badRequest(
      res,
      "Failed to get customer ID. Please contact support."
    );
  }

  const customerPortalURL = await getCustomerPortalURL(customerID.id);
  res.redirect(customerPortalURL.customer_portal_url);
}

export async function get_payment_info(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredQuery: ["baId"] });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { baId } = req.query;

  const order: PolarOrderDB[] = await DEVELOPERS_DB.findDocuments("payments", {
    betterAuthId: baId as string,
  });

  if (order.length === 0) {
    return res.status(200).json(
      createGenericResponse(
        false,
        [],
        "No active subscription found for this user. Purchase a new subscription to continue.",
        200
      )
    );
  }

  const paymentInfo = { ...order[0], customerSessionToken: null };

  return res.status(200).json(
    createSuccessResponse(paymentInfo, "Payment info fetched successfully.")
  );
}

export async function get_usage(req: Request, res: Response) {
  const validation = validateRequest(req, { requiredQuery: ["baId"] });

  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }

  const { baId } = req.query;
  const document = await getUsageDocument(baId as string);

  if (!document) {
    return res.status(200).json(
      createGenericResponse(
        false,
        [],
        "This document not exists or is unavailable.",
        200
      )
    );
  }

  return res.status(200).json(
    createSuccessResponse({ ...document, auth: "" }, "Usage info fetched successfully.")
  );
}
