import { config } from "dotenv";

config();

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rateFormatted: string;
  totalFormatted: string;
}

export interface InvoiceEmailPayload {
  invoiceNumber: string;
  issuedOn: string;
  paymentDue: string;
  clientName: string;
  clientEmail: string;
  clientAddress?: string;
  currencyCode: string;
  subtotalFormatted: string;
  totalFormatted: string;
  lineItems: InvoiceLineItem[];
  supportEmail?: string;
}

const defaultSupportEmail = process.env.SUPPORT_EMAIL || "support@reachx.dev";

export function buildInvoiceEmail(payload: InvoiceEmailPayload): string {
  const addressBlock = payload.clientAddress
    ? `<p style="margin: 4px 0; color: #9da8b3;">${payload.clientAddress}</p>`
    : "";

  const supportContact = payload.supportEmail || defaultSupportEmail;

  const lineItemsMarkup = payload.lineItems
    .map(
      (item) => `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #1c2633; color: #d7e2ef;">${item.description}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #1c2633; text-align: center; color: #9da8b3;">${item.quantity}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #1c2633; text-align: right; color: #9da8b3;">${item.rateFormatted}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #1c2633; text-align: right; color: #d7e2ef; font-weight: 600;">${item.totalFormatted}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en" style="background-color: #0b1017;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reach Invoice</title>
  </head>
  <body style="margin: 0; padding: 32px 0; background-color: #0b1017; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #d7e2ef;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; margin: 0 auto; background-color: #111927; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 45px rgba(5, 9, 15, 0.7);">
      <tr>
        <td style="padding: 32px; background: linear-gradient(135deg, #1f2a38 0%, #121a24 100%);">
          <p style="margin: 0; letter-spacing: 1.6px; text-transform: uppercase; font-size: 14px; color: #f75a68;">Invoice</p>
          <h1 style="margin: 12px 0 24px; font-size: 32px; color: #ffffff;">Your Reach Subscription Invoice</h1>
          <div style="display: flex; flex-wrap: wrap; gap: 24px;">
            <div style="flex: 1 1 220px;">
              <p style="margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #6f8197;">Billed To</p>
              <p style="margin: 6px 0 0; font-size: 18px; font-weight: 600; color: #ffffff;">${payload.clientName}</p>
              <p style="margin: 4px 0; color: #9da8b3;">${payload.clientEmail}</p>
              ${addressBlock}
            </div>
            <div style="flex: 1 1 200px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 4px 0; color: #6f8197;">Invoice No.</td>
                  <td style="padding: 4px 0; text-align: right; color: #d7e2ef; font-weight: 600;">${payload.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6f8197;">Issued On</td>
                  <td style="padding: 4px 0; text-align: right; color: #d7e2ef;">${payload.issuedOn}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6f8197;">Payment Due</td>
                  <td style="padding: 4px 0; text-align: right; color: #d7e2ef;">${payload.paymentDue}</td>
                </tr>
              </table>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 32px 32px;">
          <table role="presentation" width="100%" style="border-collapse: collapse; background-color: #121c2b; border-radius: 16px; overflow: hidden;">
            <thead>
              <tr style="background-color: #192535;">
                <th style="padding: 14px 16px; text-align: left; color: #9da8b3; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Service</th>
                <th style="padding: 14px 16px; text-align: center; color: #9da8b3; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Qty</th>
                <th style="padding: 14px 16px; text-align: right; color: #9da8b3; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Rate</th>
                <th style="padding: 14px 16px; text-align: right; color: #9da8b3; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Total</th>
              </tr>
            </thead>
            <tbody>${lineItemsMarkup}</tbody>
            <tfoot>
              <tr>
                <td colspan="2"></td>
                <td style="padding: 18px 16px; text-align: right; color: #9da8b3; text-transform: uppercase; letter-spacing: 1px;">Subtotal</td>
                <td style="padding: 18px 16px; text-align: right; color: #d7e2ef; font-weight: 600;">${payload.subtotalFormatted}</td>
              </tr>
              <tr>
                <td colspan="2"></td>
                <td style="padding: 6px 16px 22px; text-align: right; color: #9da8b3; text-transform: uppercase; letter-spacing: 1px;">Total (${payload.currencyCode})</td>
                <td style="padding: 6px 16px 22px; text-align: right; color: #ffffff; font-weight: 700; font-size: 18px;">${payload.totalFormatted}</td>
              </tr>
            </tfoot>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 32px 36px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #9da8b3;">Thank you for choosing Reach. If you have any questions about this invoice, reach out and we'll be happy to help.</p>
          <p style="margin: 0; font-size: 14px; color: #6f8197;">Need assistance? Email us at <a href="mailto:${supportContact}" style="color: #4db0ff; text-decoration: none;">${supportContact}</a>.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 24px 32px; border-top: 1px solid #161f2b; background-color: #0d141f; text-align: center; color: #5f7086; font-size: 12px;">
          Reach SDK © ${new Date().getFullYear()} · All rights reserved
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
