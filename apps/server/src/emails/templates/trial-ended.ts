// DORMANT: This template is for the future end-client subscription model. Not used by SI billing.
/**
 * Trial Ended email template.
 * Sent when a user's trial has expired.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface TrialEndedEmailData {
  userName: string;
  previousPlanName: string;
  subscribeUrl: string;
  specialOffer?: {
    discount: string; // e.g., "20%"
    expiresAt: string; // e.g., "January 20, 2024"
  };
  featuresLost?: string[]; // Features they no longer have access to
}

export function renderTrialEndedEmail(data: TrialEndedEmailData): string {
  const { userName, previousPlanName, subscribeUrl, specialOffer, featuresLost } = data;

  let offerSection = '';
  if (specialOffer) {
    offerSection = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:2px solid #7c3aed;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);padding:24px;text-align:center;">
            <p style="margin:0 0 8px;font-size:14px;color:#059669;font-weight:600;">🎁 SPECIAL OFFER</p>
            <p style="margin:0 0 8px;font-size:32px;font-weight:700;color:#047857;">${escapeHtml(specialOffer.discount)} OFF</p>
            <p style="margin:0;font-size:14px;color:#064e3b;">
              Subscribe to ${escapeHtml(previousPlanName)} now and save!<br/>
              <span style="font-size:12px;color:#059669;">Offer expires ${escapeHtml(specialOffer.expiresAt)}</span>
            </p>
          </td>
        </tr>
      </table>`;
  }

  let featuresSection = '';
  if (featuresLost && featuresLost.length > 0) {
    const featuresList = featuresLost
      .map((f) => `<li style="padding:4px 0;">${escapeHtml(f)}</li>`)
      .join('');
    featuresSection = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#f8fafc;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">Features you're missing out on</p>
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
      Your Trial Has Ended
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>

    <!-- Status Banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:20px;text-align:center;">
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Your ${escapeHtml(previousPlanName)} trial has ended</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#0f172a;">
            Your account is now on the <span style="color:#64748b;">Free</span> plan
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      We hope you enjoyed exploring everything ${escapeHtml(previousPlanName)} has to offer.
      Your account has been switched to our Free plan, so you can still access RevBrain
      with limited features.
    </p>

    ${offerSection}
    ${featuresSection}

    ${ctaButton(specialOffer ? 'Claim Your Discount' : 'Subscribe Now', subscribeUrl)}

    <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.5;">
      Upgrade anytime to unlock all features and take your projects to the next level.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td style="padding:16px 20px;background-color:#f8fafc;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">What's included in Free?</p>
          <ul style="margin:0;padding:0 0 0 20px;font-size:13px;color:#64748b;line-height:1.6;">
            <li>1 team member</li>
            <li>2 projects</li>
            <li>1 GB storage</li>
            <li>Core project management features</li>
          </ul>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
      Questions? Reply to this email — we're here to help you get the most out of RevBrain.
    </p>`;

  return wrapInLayout(content, `Your ${previousPlanName} trial has ended`);
}
