// DORMANT: This template is for the future end-client subscription model. Not used by SI billing.
/**
 * Subscription Changed email template.
 * Sent when a subscription is upgraded, downgraded, canceled, or reactivated.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface SubscriptionChangedEmailData {
  userName: string;
  changeType: 'upgrade' | 'downgrade' | 'canceled' | 'reactivated';
  previousPlan?: string;
  newPlan: string;
  effectiveDate: string; // e.g., "January 1, 2024"
  newFeatures?: string[]; // Features gained (for upgrades)
  lostFeatures?: string[]; // Features lost (for downgrades)
  billingUrl: string;
}

export function renderSubscriptionChangedEmail(data: SubscriptionChangedEmailData): string {
  const {
    userName,
    changeType,
    previousPlan,
    newPlan,
    effectiveDate,
    newFeatures,
    lostFeatures,
    billingUrl,
  } = data;

  const titles: Record<string, string> = {
    upgrade: 'Subscription Upgraded! 🎉',
    downgrade: 'Plan Changed',
    canceled: 'Subscription Canceled',
    reactivated: 'Welcome Back! 🎉',
  };

  const descriptions: Record<string, string> = {
    upgrade: `Great news! Your subscription has been upgraded to <strong style="color:#7c3aed;">${escapeHtml(newPlan)}</strong>.`,
    downgrade: `Your plan has been changed from ${previousPlan ? escapeHtml(previousPlan) : 'your previous plan'} to <strong style="color:#0f172a;">${escapeHtml(newPlan)}</strong>.`,
    canceled: `Your <strong style="color:#0f172a;">${escapeHtml(newPlan)}</strong> subscription has been canceled.`,
    reactivated: `Your <strong style="color:#7c3aed;">${escapeHtml(newPlan)}</strong> subscription has been reactivated!`,
  };

  let featuresSection = '';

  if (changeType === 'upgrade' && newFeatures && newFeatures.length > 0) {
    const featuresList = newFeatures
      .map((f) => `<li style="padding:4px 0;">${escapeHtml(f)}</li>`)
      .join('');
    featuresSection = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #d1fae5;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#ecfdf5;padding:16px 20px;border-bottom:1px solid #d1fae5;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#059669;">✨ New Features Unlocked</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;">
            <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#064e3b;line-height:1.6;">
              ${featuresList}
            </ul>
          </td>
        </tr>
      </table>`;
  }

  if (changeType === 'downgrade' && lostFeatures && lostFeatures.length > 0) {
    const featuresList = lostFeatures
      .map((f) => `<li style="padding:4px 0;">${escapeHtml(f)}</li>`)
      .join('');
    featuresSection = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#fef2f2;padding:16px 20px;border-bottom:1px solid #fecaca;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#dc2626;">Features No Longer Available</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;">
            <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#7f1d1d;line-height:1.6;">
              ${featuresList}
            </ul>
            <p style="margin:12px 0 0;font-size:13px;color:#94a3b8;">
              You can upgrade again anytime to restore these features.
            </p>
          </td>
        </tr>
      </table>`;
  }

  let canceledSection = '';
  if (changeType === 'canceled') {
    canceledSection = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#fef2f2;padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#dc2626;">What happens next?</p>
            <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.5;">
              Your access will continue until <strong>${escapeHtml(effectiveDate)}</strong>.
              After that, your account will revert to the Free plan with limited features.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
        Changed your mind? You can reactivate your subscription anytime before the end of your billing period.
      </p>`;
  }

  const buttonText =
    changeType === 'canceled'
      ? 'Reactivate Subscription'
      : changeType === 'upgrade'
        ? 'Explore Your New Features'
        : 'Manage Subscription';

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      ${titles[changeType]}
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      ${descriptions[changeType]}
      ${changeType !== 'canceled' ? `This change is effective ${escapeHtml(effectiveDate)}.` : ''}
    </p>

    ${featuresSection}
    ${canceledSection}

    ${ctaButton(buttonText, billingUrl)}

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      Questions about your subscription? Reply to this email and we'll help you out.
    </p>`;

  const previewTexts: Record<string, string> = {
    upgrade: `You've upgraded to ${newPlan}!`,
    downgrade: `Your plan has been changed to ${newPlan}`,
    canceled: `Your subscription has been canceled`,
    reactivated: `Welcome back! Your ${newPlan} subscription is active`,
  };

  return wrapInLayout(content, previewTexts[changeType]);
}
