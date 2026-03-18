/**
 * Refund Confirmation email template.
 * Sent when a refund is processed (via admin or Stripe webhook).
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface RefundConfirmationEmailData {
  userName: string;
  orgName: string;
  refundAmount: string; // Formatted amount e.g., "$49.00"
  originalAmount: string;
  isFullRefund: boolean;
  reason: string;
  refundDate: string; // e.g., "January 1, 2024"
  billingUrl: string;
}

export function renderRefundConfirmationEmail(data: RefundConfirmationEmailData): string {
  const {
    userName,
    orgName,
    refundAmount,
    originalAmount,
    isFullRefund,
    reason,
    refundDate,
    billingUrl,
  } = data;

  const refundType = isFullRefund ? 'Full Refund' : 'Partial Refund';

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      ${refundType} Processed
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      We've processed a refund for your account. Here are the details:
    </p>

    <!-- Refund Details -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background-color:#f8fafc;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">Refund Details</p>
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
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Refund Type</td>
              <td style="padding:8px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">${refundType}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Original Amount</td>
              <td style="padding:8px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">${escapeHtml(originalAmount)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Refund Date</td>
              <td style="padding:8px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">${escapeHtml(refundDate)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:12px 0 0;border-top:1px solid #e2e8f0;"></td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:16px;font-weight:600;color:#0f172a;">Refund Amount</td>
              <td style="padding:8px 0;font-size:16px;font-weight:700;color:#10b981;text-align:right;">${escapeHtml(refundAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.5;">
      <strong>Reason:</strong> ${escapeHtml(reason)}
    </p>

    <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.5;">
      The refund should appear in your account within 5-10 business days, depending on your bank.
    </p>

    ${ctaButton('View Billing History', billingUrl)}

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      Questions about this refund? Reply to this email and we'll be happy to help.
    </p>`;

  return wrapInLayout(content, `Refund processed: ${refundAmount}`);
}
