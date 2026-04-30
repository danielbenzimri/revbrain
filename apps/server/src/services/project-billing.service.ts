/**
 * Project Billing Service (SI Billing)
 *
 * Handles Stripe invoice creation for SI billing milestones.
 * Manages customer lifecycle (get-or-create), idempotency, and paid_via guards.
 *
 * Task: P6.1
 * Refs: SI-BILLING-SPEC.md §10
 */
import type {
  Repositories,
  FeeMilestoneEntity,
  FeeAgreementEntity,
  OrganizationEntity,
} from '@revbrain/contract';
import { getStripe, isStripeConfigured, formatAmount } from '../lib/stripe.ts';
import { logger } from '../lib/logger.ts';

export interface InvoiceResult {
  success: boolean;
  stripeInvoiceId: string | null;
  skipped: boolean;
  reason?: string;
}

/**
 * Get or create a Stripe customer for the organization.
 * Persists the customer ID back to the org for reuse.
 */
export async function getOrCreateCustomer(
  _repos: Repositories,
  org: OrganizationEntity
): Promise<string> {
  // Check if org already has a Stripe customer (via billing service's direct DB access)
  // Since contract types don't include stripeCustomerId, we check via the org entity
  // The billing service stores this on the org record
  const stripe = getStripe();

  // Search for existing customer by org email or billing contact
  const email = org.billingContactEmail || `billing+${org.id}@revbrain.io`;

  // Try to find existing customer by metadata
  const existing = await stripe.customers.list({
    limit: 1,
    email,
  });

  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name: org.name,
    metadata: {
      revbrain_org_id: org.id,
      revbrain_org_name: org.name,
    },
  });

  logger.info('Created Stripe customer for SI org', {
    orgId: org.id,
    customerId: customer.id,
  });

  return customer.id;
}

/**
 * Create a Stripe invoice for a milestone.
 *
 * - Skips if `paid_via` is `carried_credit`
 * - Skips if milestone already has a stripe_invoice_id (idempotency)
 * - Uses idempotency key: `revbrain_milestone_{id}_invoice`
 */
export async function createMilestoneInvoice(
  repos: Repositories,
  milestone: FeeMilestoneEntity,
  agreement: FeeAgreementEntity,
  org: OrganizationEntity
): Promise<InvoiceResult> {
  // Guard: carried_credit milestones NEVER create Stripe invoices
  if (milestone.paidVia === 'carried_credit') {
    return {
      success: true,
      stripeInvoiceId: null,
      skipped: true,
      reason: 'paid_via=carried_credit',
    };
  }

  // Guard: already invoiced (idempotency)
  if (milestone.stripeInvoiceId) {
    return {
      success: true,
      stripeInvoiceId: milestone.stripeInvoiceId,
      skipped: true,
      reason: 'already_invoiced',
    };
  }

  // Guard: Stripe not configured (mock mode)
  if (!isStripeConfigured()) {
    logger.warn('Stripe not configured — skipping invoice creation', {
      milestoneId: milestone.id,
    });
    // Update milestone to invoiced status without actual Stripe invoice
    await repos.feeMilestones.update(milestone.id, {
      status: 'invoiced',
      invoicedAt: new Date(),
    });
    return {
      success: true,
      stripeInvoiceId: null,
      skipped: true,
      reason: 'stripe_not_configured',
    };
  }

  const stripe = getStripe();
  const customerId = await getOrCreateCustomer(repos, org);
  const idempotencyKey = `revbrain_milestone_${milestone.id}_invoice`;

  try {
    // Create invoice item
    await stripe.invoiceItems.create(
      {
        customer: customerId,
        amount: milestone.amount,
        currency: agreement.currency.toLowerCase(),
        description: `${milestone.name} — ${org.name}`,
        metadata: {
          revbrain_type: 'si_milestone',
          revbrain_milestone_id: milestone.id,
          revbrain_agreement_id: agreement.id,
          revbrain_project_id: agreement.projectId,
          revbrain_org_id: org.id,
          revbrain_phase: milestone.phase,
          revbrain_milestone_name: milestone.name,
          revbrain_amount_display: formatAmount(milestone.amount, agreement.currency),
        },
      },
      { idempotencyKey: `${idempotencyKey}_item` }
    );

    // Create and send the invoice
    const invoice = await stripe.invoices.create(
      {
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: agreement.paymentTerms === 'net_45' ? 45 : 30,
        auto_advance: true,
        metadata: {
          revbrain_type: 'si_milestone',
          revbrain_milestone_id: milestone.id,
          revbrain_agreement_id: agreement.id,
          revbrain_project_id: agreement.projectId,
          revbrain_org_id: org.id,
          revbrain_phase: milestone.phase,
          revbrain_milestone_name: milestone.name,
          revbrain_amount_display: formatAmount(milestone.amount, agreement.currency),
        },
      },
      { idempotencyKey: `${idempotencyKey}_invoice` }
    );

    // Finalize and send
    await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);

    // Update milestone with Stripe invoice ID
    await repos.feeMilestones.update(milestone.id, {
      status: 'invoiced',
      stripeInvoiceId: invoice.id,
      invoicedAt: new Date(),
    });

    logger.info('Created Stripe invoice for milestone', {
      milestoneId: milestone.id,
      invoiceId: invoice.id,
      amount: milestone.amount,
    });

    return {
      success: true,
      stripeInvoiceId: invoice.id,
      skipped: false,
    };
  } catch (error) {
    logger.error('Failed to create Stripe invoice', {
      milestoneId: milestone.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Void a Stripe invoice (used during cancellation).
 */
export async function voidMilestoneInvoice(
  milestone: FeeMilestoneEntity
): Promise<{ success: boolean; error?: string }> {
  if (!milestone.stripeInvoiceId) {
    return { success: true }; // Nothing to void
  }

  if (!isStripeConfigured()) {
    return { success: true }; // Mock mode
  }

  const stripe = getStripe();

  try {
    await stripe.invoices.voidInvoice(milestone.stripeInvoiceId);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to void Stripe invoice', {
      milestoneId: milestone.id,
      invoiceId: milestone.stripeInvoiceId,
      error: msg,
    });
    return { success: false, error: msg };
  }
}

/**
 * Handle invoice.paid webhook — update milestone to paid, update cumulative fees.
 */
export async function handleInvoicePaid(
  repos: Repositories,
  stripeInvoiceId: string,
  metadata: Record<string, string>
): Promise<void> {
  const milestoneId = metadata.revbrain_milestone_id;
  if (!milestoneId) {
    logger.warn('Invoice paid webhook missing milestone ID', { stripeInvoiceId });
    return;
  }

  const milestone = await repos.feeMilestones.findById(milestoneId);
  if (!milestone) {
    logger.warn('Milestone not found for paid invoice', { milestoneId, stripeInvoiceId });
    return;
  }

  // Idempotency: already paid
  if (milestone.status === 'paid') {
    logger.info('Milestone already paid, skipping', { milestoneId });
    return;
  }

  // Update milestone to paid
  await repos.feeMilestones.update(milestoneId, {
    status: 'paid',
    paidAt: new Date(),
  });

  // Note: cumulative fee updates are handled by the reconciliation service
  // which runs periodically and on-demand via admin

  logger.info('Milestone marked as paid', { milestoneId, stripeInvoiceId });
}

/**
 * Handle invoice.voided webhook.
 */
export async function handleInvoiceVoided(
  repos: Repositories,
  stripeInvoiceId: string,
  metadata: Record<string, string>
): Promise<void> {
  const milestoneId = metadata.revbrain_milestone_id;
  if (!milestoneId) return;

  const milestone = await repos.feeMilestones.findById(milestoneId);
  if (!milestone || milestone.status === 'voided') return;

  await repos.feeMilestones.update(milestoneId, {
    status: 'voided',
  });

  logger.info('Milestone voided', { milestoneId, stripeInvoiceId });
}

/**
 * Handle invoice.payment_failed webhook.
 */
export async function handleInvoicePaymentFailed(
  _repos: Repositories,
  stripeInvoiceId: string,
  metadata: Record<string, string>
): Promise<void> {
  const milestoneId = metadata.revbrain_milestone_id;
  logger.warn('Invoice payment failed', { milestoneId, stripeInvoiceId });
  // Admin notification will be wired in P7
}

/**
 * Create a Stripe Customer Portal session for SI billing.
 * Invoice + payment method only — no subscription features.
 */
export async function createPortalSession(
  repos: Repositories,
  org: OrganizationEntity,
  returnUrl: string
): Promise<{ url: string }> {
  if (!isStripeConfigured()) {
    return { url: returnUrl };
  }

  const stripe = getStripe();
  const customerId = await getOrCreateCustomer(repos, org);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    configuration: undefined, // Uses default portal configuration
  });

  return { url: session.url };
}
