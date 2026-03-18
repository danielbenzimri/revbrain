/**
 * Welcome email template.
 * Sent when a user's account is activated for the first time.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface WelcomeEmailData {
  userName: string;
  orgName: string;
  loginUrl: string;
}

export function renderWelcomeEmail(data: WelcomeEmailData): string {
  const { userName, orgName, loginUrl } = data;

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      Welcome to Geometrix!
    </h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Your account with <strong style="color:#0f172a;">${escapeHtml(orgName)}</strong> is all set up and ready to go.
      We're excited to have you on board!
    </p>

    ${ctaButton('Get Started', loginUrl)}

    <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.5;">
      If you have any questions, just reply to this email &mdash; we're here to help.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      You received this email because an account was created for you on Geometrix.
    </p>`;

  return wrapInLayout(content, `Welcome to Geometrix, ${userName}!`);
}
