/**
 * Trial Ending email template.
 * Sent when a user's trial is about to expire (typically 3 days before).
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface TrialEndingEmailData {
  userName: string;
  planName: string;
  trialEndDate: string; // e.g., "January 15, 2024"
  daysRemaining: number;
  price: string; // Formatted price e.g., "$49/month"
  addPaymentUrl: string;
  features?: string[]; // Key features to highlight
}

export function renderTrialEndingEmail(data: TrialEndingEmailData): string {
  const { userName, planName, trialEndDate, daysRemaining, price, addPaymentUrl, features } = data;

  const urgencyColor = daysRemaining <= 1 ? '#dc2626' : daysRemaining <= 3 ? '#f59e0b' : '#64748b';
  const daysText = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;

  let featuresSection = '';
  if (features && features.length > 0) {
    const featuresList = features
      .map((f) => `<li style="padding:4px 0;">${escapeHtml(f)}</li>`)
      .join('');
    featuresSection = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#f8fafc;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">Features you'll keep with ${escapeHtml(planName)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;">
            <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#64748b;line-height:1.6;">
              ${featuresList}
            </ul>
          </td>
        </tr>
      </table>`;
  }

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      Your Trial Ends Soon
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>

    <!-- Countdown Banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:14px;color:#92400e;">Your ${escapeHtml(planName)} trial ends in</p>
          <p style="margin:0;font-size:32px;font-weight:700;color:${urgencyColor};">${daysText}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#92400e;">${escapeHtml(trialEndDate)}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      We hope you've been enjoying your trial! To continue using all the features
      of ${escapeHtml(planName)}, add your payment method before your trial expires.
    </p>

    ${featuresSection}

    <!-- Pricing Info -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #d1fae5;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background-color:#ecfdf5;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:14px;color:#059669;">Continue with ${escapeHtml(planName)} for</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#047857;">${escapeHtml(price)}</p>
        </td>
      </tr>
    </table>

    ${ctaButton('Add Payment Method', addPaymentUrl)}

    <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.5;">
      No payment will be charged until your trial ends. You can cancel anytime.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      Not ready to subscribe? Your account will automatically switch to our Free plan
      when your trial ends. You won't lose any data, but some features will be limited.
    </p>`;

  return wrapInLayout(content, `Your ${planName} trial ends in ${daysText}`);
}
