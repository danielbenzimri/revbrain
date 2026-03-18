/**
 * Payment Receipt email template.
 * Sent when a payment is successfully processed via Stripe webhook.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface PaymentReceiptEmailData {
  userName: string;
  orgName: string;
  amount: string; // Formatted amount e.g., "$49.00"
  planName: string;
  billingPeriod: string; // e.g., "Jan 1, 2024 - Feb 1, 2024"
  receiptUrl: string;
  paymentDate: string; // e.g., "January 1, 2024"
}

export function renderPaymentReceiptEmail(data: PaymentReceiptEmailData): string {
  const { userName, orgName, amount, planName, billingPeriod, receiptUrl, paymentDate } = data;

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      Payment Received
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Thank you for your payment! Here's a summary of your transaction:
    </p>

    <!-- Receipt Details -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background-color:#f8fafc;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">Receipt Details</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Organization</td>
              <td style="padding:8px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">${escapeHtml(orgName)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Plan</td>
              <td style="padding:8px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">${escapeHtml(planName)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Billing Period</td>
              <td style="padding:8px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">${escapeHtml(billingPeriod)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Payment Date</td>
              <td style="padding:8px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">${escapeHtml(paymentDate)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:12px 0 0;border-top:1px solid #e2e8f0;"></td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:16px;font-weight:600;color:#0f172a;">Total Paid</td>
              <td style="padding:8px 0;font-size:16px;font-weight:700;color:#7c3aed;text-align:right;">${escapeHtml(amount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton('View Receipt', receiptUrl)}

    <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.5;">
      This receipt is also available in your Stripe billing portal at any time.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      Questions about your billing? Reply to this email and we'll be happy to help.
    </p>`;

  return wrapInLayout(content, `Payment received: ${amount} for ${planName}`);
}
