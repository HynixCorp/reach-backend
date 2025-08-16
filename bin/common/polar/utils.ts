import { config } from "dotenv";
import { PolarCheckoutResponse, PolarCustomerMeResponse, PolarCustomerSessionResponse } from "../../interfaces/polar";

config();

const POLAR_TOKEN = process.env.POLAR_API_KEY;
const POLAR_URI = process.env.POLAR_ENDPOINT_URI;

export function revokeProducts(products: string[]) {

}

export async function getCheckoutInfo(checkoutId: string): Promise<PolarCheckoutResponse> {

    const response = await fetch(`${POLAR_URI}/checkouts/${checkoutId}`, {
        headers: {
            "Authorization": `Bearer ${POLAR_TOKEN}`
        },
        method: "GET"
    });

    if(!response.ok) {
        throw new Error("Failed to get checkout info");
    }
    
    const data: PolarCheckoutResponse = await response.json() as PolarCheckoutResponse;
    return data;
}

export async function getCustomerID(customerSessionToken: string): Promise<PolarCustomerMeResponse> {

    const response = await fetch(`${POLAR_URI}/customer-portal/customers/me`, {
        headers: {
            "Authorization": `Bearer ${customerSessionToken}`
        },
        method: "GET"
    });

    if(!response.ok) {
        throw new Error("Failed to get customer ID");
    }

    const data: PolarCustomerMeResponse = await response.json() as PolarCustomerMeResponse;
    return data;
}

export async function getCustomerPortalURL(customerSessionToken: string): Promise<PolarCustomerSessionResponse> {

    const response = await fetch(`${POLAR_URI}/customer-sessions`, {
        headers: {
            "Authorization": `Bearer ${POLAR_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            customer_id: customerSessionToken.trim()
        }),
        method: "POST"
    });
    
    if(!response.ok) {
        throw new Error("Failed to get customer portal URL");
    }
    
    const data: PolarCustomerSessionResponse = await response.json() as PolarCustomerSessionResponse;
    return data;

}