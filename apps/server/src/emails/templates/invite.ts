/**
 * Organization invitation email template.
 * Sent when a system admin onboards a new tenant and invites the first admin.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface InviteEmailData {
  userName: string;
  orgName: string;
  inviterName: string;
  setPasswordUrl: string;
}

export function renderInviteEmail(data: InviteEmailData): string {
  const { userName, orgName, inviterName, setPasswordUrl } = data;

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      You've been invited to RevBrain
    </h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      ${escapeHtml(inviterName)} has invited you to join
      <strong style="color:#0f172a;">${escapeHtml(orgName)}</strong> on RevBrain —
      the intelligent platform for Salesforce CPQ to Revenue Cloud migrations.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Click the button below to set your password and get started:
    </p>

    ${ctaButton('Accept Invitation', setPasswordUrl)}

    <p style="margin:24px 0 16px;font-size:13px;color:#94a3b8;line-height:1.5;">
      This invitation link expires in 24 hours. If you didn't expect this email,
      you can safely ignore it.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      You received this because ${escapeHtml(inviterName)} invited you to RevBrain.
    </p>`;

  return wrapInLayout(content, `${inviterName} invited you to ${orgName} on RevBrain`);
}
