import { Request, Response } from "express";
import { config } from "dotenv";
import { MongoDB } from "../../common/mongodb/mongodb";
import { createErrorResponse, createGenericResponse, createSuccessResponse } from "../../common/utils";
import { PolarOrderDB } from "../../types/polar";
import {
  getCheckoutInfo,
  getCustomerID,
  getCustomerPortalURL,
} from "../../common/polar/utils";
import { cryptManager } from "../../common/cryptography/cesar";

config();

const REACH_KEYWORD = process.env.CRYPTO_SECRET;
const REACH_DB = new MongoDB(process.env.DB_URI as string, "reach");
const REACH_CRYPT = cryptManager.start();

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
    plan: checkoutInfo.products[0].name.toLowerCase() as
      | "hobby"
      | "standard"
      | "pro"
      | "enterprise",
  };

  const result = await REACH_DB.insertDocument("payments", order);

  if (result === null) {
    return res
      .status(500)
      .json(
        createErrorResponse(
          "[REACH - Payments]: Failed to insert order into database. Please contact support.",
          500
        )
      );
  }

  res.redirect(`https://dashboard.reachsdk.online/`);
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
      .json(createErrorResponse("[REACH - Payments]: Failed to get customer ID. Please contact support.", 400));
  }
  const customerPortalURL = await getCustomerPortalURL(customerID.id);

  res.redirect(customerPortalURL.customer_portal_url);
}

export async function get_payment_info(req: Request, res: Response) {
  const { baId } = req.query;

  const productIds: string[] = ["c0598bff-8486-4888-bfba-c038ab207031", "fb97ea5c-b2ae-422d-b217-c57d752911fa", "2fbe7c28-8535-413d-8242-fb896ef4aa87"]

  if (!baId) {
    return res
      .status(400)
      .json(createErrorResponse("[REACH - Payments]: BA-ID is missing. Please contact support.", 400));
  }

  const order: PolarOrderDB[] = await REACH_DB.findDocuments("payments", {
    betterAuthId: baId as string,
  });

  if (order.length === 0) {
    return res
      .status(200)
      .json(createGenericResponse(false, [], "[REACH - Payments]: No active subscription found for this user. Purchase a new subscription to continue.", 200));
  }

  const paymentInfo = order[0];

  paymentInfo.customerSessionToken = null as unknown as string;
  
  switch(paymentInfo.products[0]){
    case productIds[0]:
      paymentInfo.plan = "hobby";
      break;
    case productIds[1]: 
      paymentInfo.plan = "standard";
      break;
    case productIds[2]:
      paymentInfo.plan = "pro";
      break;
    default: 
      paymentInfo.plan = "enterprise";
      break;
  }

  return res.status(200).json(createSuccessResponse(paymentInfo, "Payment info fetched successfully."));
}