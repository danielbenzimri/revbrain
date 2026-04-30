/**
 * SI Billing Email Templates (#1–#19)
 *
 * All email templates for the SI partner billing lifecycle.
 * Each function returns an HTML string rendered via the base layout.
 *
 * Task: P7.1a, P7.1b
 * Refs: SI-BILLING-SPEC.md §13
 */
import { wrapInLayout, ctaButton, escapeHtml } from './base-layout.ts';

// ============================================================================
// SHARED TYPES
// ============================================================================

interface BaseEmailData {
  recipientName: string;
  projectName: string;
  orgName: string;
}

interface MilestoneEmailData extends BaseEmailData {
  milestoneName: string;
  amount: string;
  invoiceNumber?: string;
}

// ============================================================================
// #1 — Agreement draft created → SI org owner
// ============================================================================

export function renderAgreementCreated(
  data: BaseEmailData & { assessmentFee: string; reviewUrl: string }
): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Start Your Assessment</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      A fee agreement has been created for <strong>${escapeHtml(data.projectName)}</strong>.
      Review the assessment terms and accept to begin.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Assessment Fee: <strong>${escapeHtml(data.assessmentFee)}</strong>
    </p>
    ${ctaButton('Review Agreement', data.reviewUrl)}
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #2 — Assessment accepted → Admin
// ============================================================================

export function renderAssessmentAccepted(data: BaseEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Assessment Started</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      ${escapeHtml(data.orgName)} has accepted the assessment terms for <strong>${escapeHtml(data.projectName)}</strong>.
      M1 invoice has been generated.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #3 — Terms declined → Admin
// ============================================================================

export function renderTermsDeclined(
  data: BaseEmailData & { reason: string; phase: string }
): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Terms Declined</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      ${escapeHtml(data.orgName)} has declined the ${escapeHtml(data.phase)} terms for <strong>${escapeHtml(data.projectName)}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Reason: ${escapeHtml(data.reason)}
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #4 — Migration terms ready → SI org owner
// ============================================================================

export function renderMigrationTermsReady(data: BaseEmailData & { reviewUrl: string }): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Review Migration Terms</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)}, migration terms are ready for <strong>${escapeHtml(data.projectName)}</strong>.
    </p>
    ${ctaButton('Review Terms', data.reviewUrl)}
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #5 — Migration accepted → Admin
// ============================================================================

export function renderMigrationAccepted(data: BaseEmailData & { totalFee: string }): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Migration Started</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      ${escapeHtml(data.orgName)} has accepted migration terms for <strong>${escapeHtml(data.projectName)}</strong>.
      Total fee: ${escapeHtml(data.totalFee)}.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #6 — Assessment closed → Admin
// ============================================================================

export function renderAssessmentClosed(data: BaseEmailData & { reason: string }): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Assessment Complete</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      ${escapeHtml(data.orgName)} closed <strong>${escapeHtml(data.projectName)}</strong> as assessment-only.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Reason: ${escapeHtml(data.reason)}
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #7 — Milestone invoice sent → SI billing contact
// ============================================================================

export function renderMilestoneInvoiceSent(data: MilestoneEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Invoice Sent</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)}, an invoice for ${escapeHtml(data.amount)} has been sent for
      <strong>${escapeHtml(data.milestoneName)}</strong> on project ${escapeHtml(data.projectName)}.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #8 — Payment received → SI + Admin
// ============================================================================

export function renderPaymentReceived(data: MilestoneEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Payment Received</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Payment of ${escapeHtml(data.amount)} received for <strong>${escapeHtml(data.milestoneName)}</strong>
      on project ${escapeHtml(data.projectName)}.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #9 — Milestone completion requested → Admin
// ============================================================================

export function renderCompletionRequested(data: BaseEmailData & { milestoneName: string }): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Completion Requested</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      ${escapeHtml(data.orgName)} has requested completion approval for
      <strong>${escapeHtml(data.milestoneName)}</strong> on project ${escapeHtml(data.projectName)}.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #10 — Milestone request rejected → SI
// ============================================================================

export function renderRequestRejected(
  data: BaseEmailData & { milestoneName: string; reason: string }
): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Request Update</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)}, your completion request for
      <strong>${escapeHtml(data.milestoneName)}</strong> on ${escapeHtml(data.projectName)} was not approved.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Feedback: ${escapeHtml(data.reason)}
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #11 — Overdue reminder day 1 → SI billing contact
// ============================================================================

export function renderOverdueDay1(data: MilestoneEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#c2410c;">Payment Reminder</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)}, your invoice for ${escapeHtml(data.amount)}
      (${escapeHtml(data.milestoneName)}) on project ${escapeHtml(data.projectName)} is past due.
      Please arrange payment at your earliest convenience.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #12 — Overdue reminder day 7 → SI + Admin
// ============================================================================

export function renderOverdueDay7(data: MilestoneEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#c2410c;">Second Payment Reminder</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Invoice for ${escapeHtml(data.amount)} (${escapeHtml(data.milestoneName)})
      on project ${escapeHtml(data.projectName)} is 7+ days overdue.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #13 — Overdue escalation day 14 → Admin
// ============================================================================

export function renderOverdueDay14(data: MilestoneEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#dc2626;">Action Required — Overdue Invoice</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Invoice for ${escapeHtml(data.amount)} (${escapeHtml(data.milestoneName)})
      from ${escapeHtml(data.orgName)} is 14+ days overdue. Manual outreach required.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #14 — Tier promotion → SI org owner
// ============================================================================

export function renderTierPromotion(data: {
  recipientName: string;
  newTier: string;
  orgName: string;
}): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#7c3aed;">Partner Status Upgrade</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Congratulations ${escapeHtml(data.recipientName)}!
      ${escapeHtml(data.orgName)} has reached <strong>${escapeHtml(data.newTier)}</strong> partner status.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #15 — Agreement completed → SI + Admin
// ============================================================================

export function renderAgreementCompleted(data: BaseEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Project Complete</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      <strong>${escapeHtml(data.projectName)}</strong> for ${escapeHtml(data.orgName)} has been completed.
      All milestones are paid. Data will be archived after 90 days.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #16 — Archive reminder 30 days → SI org owner
// ============================================================================

export function renderArchiveWarning30(data: BaseEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Data Archiving in 30 Days</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)}, project data for <strong>${escapeHtml(data.projectName)}</strong>
      will be archived in 30 days. Download any data you need before then.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #17 — Archive reminder 7 days → SI org owner
// ============================================================================

export function renderArchiveWarning7(data: BaseEmailData): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#dc2626;">Data Archiving in 7 Days</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)}, project data for <strong>${escapeHtml(data.projectName)}</strong>
      will be archived in 7 days. This is your final reminder.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #18 — Migration pending review → Admin
// ============================================================================

export function renderMigrationPendingReview(
  data: BaseEmailData & { declaredValue: string }
): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Review Required</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      ${escapeHtml(data.orgName)} has submitted a migration value of <strong>${escapeHtml(data.declaredValue)}</strong>
      for project <strong>${escapeHtml(data.projectName)}</strong>. Please review and approve the terms.
    </p>
  `;
  return wrapInLayout(content);
}

// ============================================================================
// #19 — Value revision requested → SI org owner
// ============================================================================

export function renderValueRevisionRequested(data: BaseEmailData & { reason: string }): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">Revision Requested</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.5;">
      Hi ${escapeHtml(data.recipientName)}, the admin has requested a revision of the migration value
      for <strong>${escapeHtml(data.projectName)}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
      Reason: ${escapeHtml(data.reason)}
    </p>
  `;
  return wrapInLayout(content);
}
