/**
 * Lead notification email template.
 * Sent to sales team when a new enterprise lead is submitted.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface LeadNotificationEmailData {
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  companyName: string;
  companySize: string;
  message: string;
  source: string;
  dashboardUrl: string;
}

export function renderLeadNotificationEmail(data: LeadNotificationEmailData): string {
  const {
    leadName,
    leadEmail,
    leadPhone,
    companyName,
    companySize,
    message,
    source,
    dashboardUrl,
  } = data;

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      🎯 New Enterprise Lead
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      A potential customer has submitted a contact request.
    </p>

    <div style="background-color:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#0f172a;">
        Contact Details
      </h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;width:120px;">Name</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:500;">${escapeHtml(leadName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;">Email</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:500;">
            <a href="mailto:${escapeHtml(leadEmail)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(leadEmail)}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;">Phone</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:500;">${escapeHtml(leadPhone)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;">Company</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:500;">${escapeHtml(companyName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;">Team Size</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:500;">${escapeHtml(companySize)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;">Source</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:500;">${escapeHtml(source)}</td>
        </tr>
      </table>
    </div>

    <div style="background-color:#fef3c7;border-radius:8px;padding:16px;margin-bottom:24px;">
      <h3 style="margin:0 0 8px;font-size:14px;font-weight:600;color:#92400e;">
        Message
      </h3>
      <p style="margin:0;font-size:14px;color:#78350f;line-height:1.5;">
        ${escapeHtml(message) || '<em>No message provided</em>'}
      </p>
    </div>

    ${ctaButton('View Lead in Dashboard', dashboardUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.5;">
      Respond promptly — leads are most likely to convert when contacted within 24 hours.
    </p>`;

  return wrapInLayout(content, `New Lead: ${companyName || leadName}`);
}
