import { config } from "dotenv";
import { PolarCheckoutResponse, PolarCustomerMeResponse, PolarCustomerSessionResponse } from "../../types/polar";

config();

const POLAR_TOKEN = process.env.POLAR_API_KEY;
const POLAR_URI = process.env.POLAR_ENDPOINT_URI;

/**
 * Address formatting interface for Polar billing addresses
 */
export interface BillingAddress {
  line1: string | null;
  line2: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

/**
 * Format a billing address into a readable string
 */
export function formatAddress(address?: BillingAddress): string | undefined {
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

/**
 * Format a date for display in invoices
 */
export function formatDateLabel(dateValue: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateValue);
}

/**
 * Parse Polar plan ID to internal plan name
 */
export function parsePlan(productID: string): "hobby" | "standard" | "pro" | null {
  const allowedPaymentIDs = [
    "c0598bff-8486-4888-bfba-c038ab207031",
    "fb97ea5c-b2ae-422d-b217-c57d752911fa",
    "2fbe7c28-8535-413d-8242-fb896ef4aa87",
  ];

  switch (productID) {
    case allowedPaymentIDs[0]:
      return "hobby";
    case allowedPaymentIDs[1]:
      return "standard";
    case allowedPaymentIDs[2]:
      return "pro";
    default:
      return null;
  }
}

export function revokeProducts(products: string[]) {
  // TODO: Implement product revocation
}

export async function getCheckoutInfo(checkoutId: string): Promise<PolarCheckoutResponse> {
  if (!POLAR_URI || !POLAR_TOKEN) {
    throw new Error("Polar API not configured (missing POLAR_ENDPOINT_URI or POLAR_API_KEY)");
  }

  const response = await fetch(`${POLAR_URI}/checkouts/${checkoutId}`, {
    headers: {
      Authorization: `Bearer ${POLAR_TOKEN}`,
    },
    method: "GET",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Polar] getCheckoutInfo failed: ${response.status} - ${errorBody}`);
    throw new Error(`Polar API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<PolarCheckoutResponse>;
}

export async function getCustomerID(customerSessionToken: string): Promise<PolarCustomerMeResponse | null> {
  const response = await fetch(`${POLAR_URI}/customer-portal/customers/me`, {
    headers: {
      Authorization: `Bearer ${customerSessionToken}`,
    },
    method: "GET",
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<PolarCustomerMeResponse>;
}

export async function getCustomerPortalURL(customerSessionToken: string): Promise<PolarCustomerSessionResponse> {
  if (!POLAR_URI || !POLAR_TOKEN) {
    throw new Error("Polar API not configured (missing POLAR_ENDPOINT_URI or POLAR_API_KEY)");
  }

  const response = await fetch(`${POLAR_URI}/customer-sessions`, {
    headers: {
      Authorization: `Bearer ${POLAR_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer_id: customerSessionToken.trim(),
    }),
    method: "POST",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Polar] getCustomerPortalURL failed: ${response.status} - ${errorBody}`);
    throw new Error(`Polar API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<PolarCustomerSessionResponse>;
}