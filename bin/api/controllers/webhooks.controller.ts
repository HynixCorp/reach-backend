import { getReachDB } from "../../common/services/database.service";
import { resendService } from "../../common/resend/service";
import { buildInvoiceEmail } from "../../common/resend/templates/invoiceTemplate";
import { nanoid } from "nanoid";

const REACH_DB = getReachDB();

export async function handlePolarPayload(payload: any) {
    const eventType = payload.type;
    const data = payload.data;

    console.log(`[REACH - Webhooks]: Received event ${eventType}`);

    switch (eventType) {
        case "subscription.updated":
            await handleSubscriptionUpdate(data);
            break;
        case "subscription.canceled":
        case "subscription.revoked":
            await handleSubscriptionCancellation(data);
            break;
        case "order.created":
            // Handle new orders (renewals or one-time)
            // We might want to send invoices here if not handled elsewhere
            await handleOrderCreated(data);
            break;
        default:
            // console.log(`[REACH - Webhooks]: Unhandled event type ${eventType}`);
            break;
    }
}

async function handleSubscriptionUpdate(data: any) {
    const subscriptionId = data.id;
    const status = data.status;
    const currentPeriodEnd = data.current_period_end;
    
    // Map Polar status to our status
    let dbStatus: "active" | "expired" = "active";
    if (["canceled", "incomplete_expired", "unpaid", "past_due", "revoked"].includes(status)) {
        dbStatus = "expired";
    }

    const updateData: any = {
        status: dbStatus,
    };

    if (currentPeriodEnd) {
        updateData.endDate = new Date(currentPeriodEnd);
    }

    await REACH_DB.updateDocument("payments", { subscriptionId }, { $set: updateData });
    console.log(`[REACH - Webhooks]: Updated subscription ${subscriptionId} to status ${dbStatus}`);
}

async function handleSubscriptionCancellation(data: any) {
    const subscriptionId = data.id;
    await REACH_DB.updateDocument("payments", { subscriptionId }, { $set: { status: "expired" } });
    console.log(`[REACH - Webhooks]: Canceled subscription ${subscriptionId}`);
}

async function handleOrderCreated(order: any) {
    // Logic to send invoice for renewals
    // We need to check if this order corresponds to an existing subscription renewal
    
    if (!order.subscription_id) {
        return; // One-time payment or initial checkout, likely handled by success_payment or other flows
    }

    // Check if we have this subscription
    const existingSub = await REACH_DB.findDocuments("payments", { subscriptionId: order.subscription_id });
    
    if (existingSub.length === 0) {
        console.log(`[REACH - Webhooks]: Order created for unknown subscription ${order.subscription_id}`);
        return;
    }

    // Avoid duplicate emails for the initial order (handled by success_payment)
    // We assume the initial order has the same checkout_id as the subscription record
    if (order.checkout_id && order.checkout_id === existingSub[0].checkoutId) {
        console.log(`[REACH - Webhooks]: Skipping invoice for initial order ${order.id} (handled by success_payment).`);
        return;
    }

    // If it's a renewal, the order date will be newer than the initial payment date
    // We can send the invoice here.
    
    try {
        const currencyCode = (order.currency || "USD").toUpperCase();
        const formatter = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currencyCode,
        });
        
        const invoiceNumber = `INV-${nanoid(6).toUpperCase()}`;
        const totalValue = (order.amount || 0) / 100;
        const taxValue = (order.tax_amount || 0) / 100;
        const subtotalValue = totalValue - taxValue;
        
        const clientDisplayName = order.customer?.name || order.customer?.email || "Valued Customer";
        const clientEmail = order.customer?.email;
        
        if (!clientEmail) {
            console.log("[REACH - Webhooks]: No customer email in order, skipping invoice.");
            return;
        }

        const invoiceHTML = buildInvoiceEmail({
            invoiceNumber,
            issuedOn: new Date().toLocaleDateString(),
            paymentDue: new Date().toLocaleDateString(), // Paid immediately
            clientName: clientDisplayName,
            clientEmail: clientEmail,
            clientAddress: formatAddress(order.customer?.billing_address),
            currencyCode,
            subtotalFormatted: formatter.format(subtotalValue),
            totalFormatted: formatter.format(totalValue),
            lineItems: [
                {
                    description: `Subscription Renewal - ${order.product?.name || "Reach Subscription"}`,
                    quantity: 1,
                    rateFormatted: formatter.format(subtotalValue),
                    totalFormatted: formatter.format(totalValue),
                },
            ],
        });

        await resendService.sendEmail(
            clientEmail,
            `Invoice ${invoiceNumber}`,
            invoiceHTML
        );
        console.log(`[REACH - Webhooks]: Sent invoice email for order ${order.id}`);

    } catch (error) {
        console.error("[REACH - Webhooks]: Failed to send invoice email.", error);
    }
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
