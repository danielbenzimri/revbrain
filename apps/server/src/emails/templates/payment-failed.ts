/**
 * Payment Failed email template.
 * Sent when a payment attempt fails via Stripe webhook.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface PaymentFailedEmailData {
  userName: string;
  amount: string; // Formatted amount e.g., "$49.00"
  planName: string;
  updatePaymentUrl: string;
  daysUntilSuspension: number;
  failureReason?: string; // e.g., "card declined", "insufficient funds"
}

export function renderPaymentFailedEmail(data: PaymentFailedEmailData): string {
  const { userName, amount, planName, updatePaymentUrl, daysUntilSuspension, failureReason } = data;

  const reasonText = failureReason
    ? `The payment failed due to: <strong style="color:#0f172a;">${escapeHtml(failureReason)}</strong>.`
    : 'The payment could not be processed.';

  const urgencyText =
    daysUntilSuspension <= 3
      ? `<span style="color:#dc2626;font-weight:600;">Your account will be suspended in ${daysUntilSuspension} day${daysUntilSuspension === 1 ? '' : 's'}</span> if payment is not received.`
      : `Your account will remain active for ${daysUntilSuspension} more days while we retry the payment.`;

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      Payment Failed
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>

    <!-- Alert Banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;">
          <p style="margin:0;font-size:14px;color:#dc2626;line-height:1.5;">
            ⚠️ We were unable to process your payment of <strong>${escapeHtml(amount)}</strong> for your ${escapeHtml(planName)} subscription.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      ${reasonText}
    </p>

    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      ${urgencyText}
    </p>

    <!-- What You Need To Do -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background-color:#f8fafc;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">What You Need To Do</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;">
          <ol style="margin:0;padding:0 0 0 20px;font-size:14px;color:#64748b;line-height:1.8;">
            <li>Click the button below to update your payment method</li>
            <li>Verify your card details are correct and up to date</li>
            <li>Ensure your card has sufficient funds available</li>
          </ol>
        </td>
      </tr>
    </table>

    ${ctaButton('Update Payment Method', updatePaymentUrl)}

    <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.5;">
      We'll automatically retry the payment once you've updated your details.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      Need help? Reply to this email and our support team will assist you.
    </p>`;

  return wrapInLayout(content, `Action required: Payment of ${amount} failed`);
}
