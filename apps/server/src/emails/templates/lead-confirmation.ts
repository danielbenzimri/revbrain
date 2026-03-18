/**
 * Lead confirmation email template.
 * Sent to the lead after they submit the contact form.
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

export interface LeadConfirmationEmailData {
  leadName: string;
  calendlyUrl?: string;
}

export function renderLeadConfirmationEmail(data: LeadConfirmationEmailData): string {
  const { leadName, calendlyUrl } = data;

  const calendlySection = calendlyUrl
    ? `
      <div style="background-color:#ecfdf5;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
        <h3 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#065f46;">
          📅 Want to skip the wait?
        </h3>
        <p style="margin:0 0 16px;font-size:14px;color:#047857;line-height:1.5;">
          Schedule a demo directly with our team at a time that works for you.
        </p>
        ${ctaButton('Schedule a Demo', calendlyUrl)}
      </div>`
    : '';

  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">
      Thanks for reaching out!
    </h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(leadName)},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      We've received your inquiry and one of our enterprise specialists will be in touch within
      <strong style="color:#0f172a;">1 business day</strong>.
    </p>

    ${calendlySection}

    <div style="background-color:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">
        In the meantime, here's what to expect:
      </h3>
      <ul style="margin:0;padding:0 0 0 20px;color:#64748b;font-size:14px;line-height:1.8;">
        <li>A personalized walkthrough of Geometrix tailored to your needs</li>
        <li>Discussion of enterprise pricing and volume discounts</li>
        <li>Answers to any technical or integration questions</li>
        <li>Custom onboarding plan for your organization</li>
      </ul>
    </div>

    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      Have questions before then? Just reply to this email — we're always happy to help.
    </p>

    <p style="margin:0 0 8px;font-size:15px;color:#64748b;line-height:1.5;">
      Best regards,<br/>
      <strong style="color:#0f172a;">The Geometrix Team</strong>
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
      You're receiving this email because you submitted a contact request on geometrixlabs.com.
    </p>`;

  return wrapInLayout(content, 'Thanks for contacting Geometrix!');
}
