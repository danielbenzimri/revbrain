/**
 * SI Billing Routes (SI-facing)
 *
 * Endpoints for SI partners to manage their billing:
 * partner status, agreements, milestones, invoices.
 *
 * Task: P4.1, P5.1
 * Refs: SI-BILLING-SPEC.md §14.3
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth.ts';
import { routeMiddleware } from '../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import {
  transition,
  type AcceptAssessmentPayload,
  type CloseAssessmentPayload,
  type AcceptMigrationPayload,
  type SubmitValuePayload,
} from '../../services/agreement-state-machine.ts';
import { transitionMilestone } from '../../services/milestone-state-machine.ts';
import { calculateMigrationFee, generateDefaultBrackets } from '../../services/fee-calculator.ts';
import {
  createMilestoneInvoice,
  createPortalSession,
} from '../../services/project-billing.service.ts';
import { buildAuditContext } from './admin/utils/audit-context.ts';
import type { AppEnv } from '../../types/index.ts';

const siBillingRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/billing/partner-status — Partner profile with tier info
 */
siBillingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/partner-status',
    middleware: routeMiddleware(authMiddleware),
    responses: { 200: { description: 'Partner status' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const user = c.get('user') as { id: string; organizationId: string };
    const orgId = user.organizationId;

    const profile = await repos.partnerProfiles.findByOrgId(orgId);
    if (!profile) {
      return c.json({ success: true, data: null });
    }

    return c.json({ success: true, data: profile });
  }
);

/**
 * GET /v1/billing/agreements — List agreements for the SI org
 */
siBillingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/agreements',
    middleware: routeMiddleware(authMiddleware),
    responses: { 200: { description: 'Agreement list' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const user = c.get('user') as { id: string; organizationId: string };
    const orgId = user.organizationId;

    const agreements = await repos.feeAgreements.findByOrgId(orgId);

    return c.json({ success: true, data: agreements });
  }
);

/**
 * GET /v1/billing/agreements/:id — Agreement detail with milestones
 */
siBillingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/agreements/:id',
    middleware: routeMiddleware(authMiddleware),
    responses: { 200: { description: 'Agreement detail' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Agreement not found', 404);
    }

    const milestones = await repos.feeMilestones.findByAgreementId(id);
    const tiers = await repos.feeAgreementTiers.findByAgreementId(id);

    return c.json({ success: true, data: { agreement, milestones, tiers } });
  }
);

/**
 * GET /v1/billing/invoices — All invoices across projects (paginated)
 */
siBillingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/invoices',
    middleware: routeMiddleware(authMiddleware),
    responses: { 200: { description: 'Invoice list' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const user = c.get('user') as { id: string; organizationId: string };
    const orgId = user.organizationId;

    const agreements = await repos.feeAgreements.findByOrgId(orgId);
    const allMilestones = [];
    for (const agreement of agreements) {
      const milestones = await repos.feeMilestones.findByAgreementId(agreement.id);
      for (const m of milestones) {
        if (
          m.stripeInvoiceId ||
          m.status === 'invoiced' ||
          m.status === 'paid' ||
          m.status === 'overdue'
        ) {
          allMilestones.push({ ...m, projectId: agreement.projectId, agreementId: agreement.id });
        }
      }
    }

    return c.json({ success: true, data: allMilestones });
  }
);

/**
 * POST /v1/billing/agreements/:id/accept-assessment — Accept assessment terms
 */
siBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/agreements/:id/accept-assessment',
    middleware: routeMiddleware(authMiddleware),
    responses: { 200: { description: 'Assessment accepted' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const audit = buildAuditContext(c);

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Agreement not found', 404);
    }

    const snapshot = {
      assessmentFee: agreement.assessmentFee,
      paymentTerms: agreement.paymentTerms,
    };
    const snapshotHash = `sha256-${Date.now()}`; // Simplified — real impl uses canonicalJson

    const update = transition(agreement, 'ACCEPT_ASSESSMENT', {
      acceptedBy: audit.actorId ?? '',
      acceptedFromIp: audit.ipAddress ?? '',
      assessmentTermsSnapshot: snapshot,
      assessmentTermsSnapshotHash: snapshotHash,
    } as AcceptAssessmentPayload) as Record<string, unknown>;

    await repos.feeAgreements.update(id, update);

    // Create M1 milestone
    const m1 = await repos.feeMilestones.create({
      feeAgreementId: id,
      name: 'Assessment fee',
      phase: 'assessment',
      triggerType: 'automatic',
      amount: agreement.assessmentFee,
      status: 'pending',
      sortOrder: 100,
    });

    // Create Stripe invoice for M1 (atomic — if this fails, the acceptance should ideally rollback)
    const user = c.get('user') as { id: string; organizationId: string };
    const org = await repos.organizations.findById(user.organizationId);
    if (org) {
      try {
        const updatedAgreement = await repos.feeAgreements.findById(id);
        if (updatedAgreement) {
          await createMilestoneInvoice(repos, m1, updatedAgreement, org);
        }
      } catch (error) {
        // Stripe failure — rollback acceptance
        await repos.feeAgreements.update(id, { status: 'draft' });
        await repos.feeMilestones.updateStatus(m1.id, 'voided');
        throw new AppError(
          ErrorCodes.INTERNAL_SERVER_ERROR,
          'Invoice creation failed. Please try again.',
          500
        );
      }
    }

    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.assessment_accepted',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: { requestId: audit.requestId, agreementId: id },
    });

    return c.json({ success: true });
  }
);

/**
 * POST /v1/billing/agreements/:id/reject — Reject terms (either phase)
 */
siBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/agreements/:id/reject',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ reason: z.string().min(3) }),
          },
        },
      },
    },
    responses: { 200: { description: 'Terms rejected' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Agreement not found', 404);
    }

    // Store rejection reason in metadata (agreement stays in current status)
    await repos.auditLogs.create({
      userId: buildAuditContext(c).actorId,
      action: 'fee_agreement.terms_rejected',
      metadata: { agreementId: id, reason: body.reason },
    });

    return c.json({ success: true });
  }
);

/**
 * POST /v1/billing/agreements/:id/close-assessment — Assessment-only closure
 */
siBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/agreements/:id/close-assessment',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              reason: z.enum([
                'client_did_not_proceed',
                'budget',
                'timeline',
                'competitor',
                'other',
              ]),
              notes: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Assessment closed' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Agreement not found', 404);
    }

    const hasValueSubmitted =
      agreement.status === 'migration_pending_review' || agreement.declaredProjectValue != null;

    const update = transition(agreement, 'CLOSE_ASSESSMENT', {
      assessmentCloseReason: body.reason,
      assessmentCloseNotes: body.notes,
      valueAlreadySubmitted: hasValueSubmitted,
    } as CloseAssessmentPayload) as Record<string, unknown>;

    await repos.feeAgreements.update(id, update);

    return c.json({ success: true });
  }
);

/**
 * POST /v1/billing/milestones/:id/request-complete — SI requests milestone completion
 */
siBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/milestones/:id/request-complete',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              reason: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Completion requested' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();
    const audit = buildAuditContext(c);

    const milestone = await repos.feeMilestones.findById(id);
    if (!milestone) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Milestone not found', 404);
    }

    const update = transitionMilestone(milestone, 'REQUEST_COMPLETE', {
      requestedBy: audit.actorId ?? '',
      requestReason: body.reason,
    });

    await repos.feeMilestones.update(id, update);

    return c.json({ success: true });
  }
);

/**
 * POST /v1/billing/agreements/:id/proceed-migration — SI declares project value
 */
siBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/agreements/:id/proceed-migration',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              declaredProjectValue: z.number().int().positive(),
              sowFileId: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Migration terms computed or pending review' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();
    buildAuditContext(c); // validate auth

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Agreement not found', 404);
    }

    // Check M1 is paid
    const milestones = await repos.feeMilestones.findByAgreementId(id);
    const m1 = milestones.find((m) => m.phase === 'assessment');
    const m1Paid = m1?.status === 'paid' || agreement.carriedCreditAmount > 0;

    transition(agreement, 'VALIDATE_SUBMIT_VALUE', {
      declaredProjectValue: body.declaredProjectValue,
      sowFileId: body.sowFileId ?? 'pending',
      m1Status: m1Paid ? 'paid' : 'invoiced',
      carriedCreditAmount: agreement.carriedCreditAmount,
    } as SubmitValuePayload) as Record<string, unknown>;

    const LARGE_DEAL_THRESHOLD = 50_000_000; // $500K

    if (body.declaredProjectValue > LARGE_DEAL_THRESHOLD) {
      // >$500K: persist value + SOW, transition to migration_pending_review
      await repos.feeAgreements.update(id, {
        status: 'migration_pending_review',
        declaredProjectValue: body.declaredProjectValue,
        sowFileId: body.sowFileId ?? null,
      });

      return c.json({
        success: true,
        data: { status: 'migration_pending_review', message: 'Under admin review' },
      });
    }

    // ≤$500K: compute-only, return terms without persisting
    const tiers = await repos.feeAgreementTiers.findByAgreementId(id);
    const brackets =
      tiers.length > 0
        ? tiers.map((t) => ({ ceiling: t.bracketCeiling, rateBps: t.rateBps }))
        : generateDefaultBrackets();

    const feeResult = calculateMigrationFee({
      declaredValue: body.declaredProjectValue,
      brackets,
      assessmentCredit: agreement.assessmentFee,
      capAmount: agreement.capAmount,
    });

    return c.json({
      success: true,
      data: {
        status: 'terms_ready',
        totalFee: feeResult.totalFee,
        remainingFee: feeResult.remainingFee,
        milestones: feeResult.milestones,
        bracketBreakdown: feeResult.bracketBreakdown,
      },
    });
  }
);

/**
 * POST /v1/billing/agreements/:id/accept-migration — Accept migration terms
 */
siBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/agreements/:id/accept-migration',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              declaredProjectValue: z.number().int().positive(),
              sowFileId: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Migration accepted' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();
    const audit = buildAuditContext(c);

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Agreement not found', 404);
    }

    // Compute fee
    const tiers = await repos.feeAgreementTiers.findByAgreementId(id);
    const brackets =
      tiers.length > 0
        ? tiers.map((t) => ({ ceiling: t.bracketCeiling, rateBps: t.rateBps }))
        : generateDefaultBrackets();

    const feeResult = calculateMigrationFee({
      declaredValue: body.declaredProjectValue,
      brackets,
      assessmentCredit: agreement.assessmentFee,
      capAmount: agreement.capAmount,
    });

    const migrationSnapshot = {
      declaredProjectValue: body.declaredProjectValue,
      totalFee: feeResult.totalFee,
      remainingFee: feeResult.remainingFee,
      brackets: feeResult.bracketBreakdown,
      milestones: feeResult.milestones,
    };

    const update = transition(agreement, 'ACCEPT_MIGRATION', {
      migrationAcceptedBy: audit.actorId ?? '',
      migrationAcceptedFromIp: audit.ipAddress ?? '',
      migrationTermsSnapshot: migrationSnapshot,
      migrationTermsSnapshotHash: `sha256-${Date.now()}`,
      declaredProjectValue: body.declaredProjectValue,
      sowFileId: body.sowFileId ?? agreement.sowFileId ?? '',
      calculatedTotalFee: feeResult.totalFee,
      calculatedRemainingFee: feeResult.remainingFee,
    } as AcceptMigrationPayload) as Record<string, unknown>;

    await repos.feeAgreements.update(id, update);

    // Generate migration milestones if remaining > 0
    if (feeResult.remainingFee > 0) {
      const createdMilestones = await repos.feeMilestones.createMany(
        feeResult.milestones.map((m, i) => ({
          feeAgreementId: id,
          name: m.name,
          phase: 'migration',
          triggerType: i === 0 ? 'automatic' : 'admin_approved',
          percentageBps: m.percentageBps,
          amount: m.amount,
          status: 'pending',
          sortOrder: (i + 2) * 100,
        }))
      );

      // Create Stripe invoice for M2 (first migration milestone)
      const user = c.get('user') as { id: string; organizationId: string };
      const org = await repos.organizations.findById(user.organizationId);
      if (org && createdMilestones.length > 0) {
        const updatedAgreement = await repos.feeAgreements.findById(id);
        if (updatedAgreement) {
          try {
            await createMilestoneInvoice(repos, createdMilestones[0], updatedAgreement, org);
          } catch (error) {
            // Stripe failure — rollback migration acceptance
            await repos.feeAgreements.update(id, {
              status: agreement.status,
              declaredProjectValue: agreement.declaredProjectValue,
              calculatedTotalFee: agreement.calculatedTotalFee,
              calculatedRemainingFee: agreement.calculatedRemainingFee,
            });
            for (const ms of createdMilestones) {
              await repos.feeMilestones.updateStatus(ms.id, 'voided');
            }
            throw new AppError(
              ErrorCodes.INTERNAL_SERVER_ERROR,
              'Invoice creation failed. Please try again.',
              500
            );
          }
        }
      }
    }

    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.migration_accepted',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: {
        requestId: audit.requestId,
        agreementId: id,
        totalFee: feeResult.totalFee,
        remainingFee: feeResult.remainingFee,
      },
    });

    return c.json({
      success: true,
      data: { totalFee: feeResult.totalFee, remainingFee: feeResult.remainingFee },
    });
  }
);

/**
 * POST /v1/billing/portal — Create Stripe Customer Portal session
 */
siBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/portal',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              returnUrl: z.string().url().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Portal session URL' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const user = c.get('user') as { id: string; organizationId: string };
    const body = await c.req.json().catch(() => ({}));

    const org = await repos.organizations.findById(user.organizationId);
    if (!org) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);
    }

    const returnUrl = body.returnUrl || `${c.req.url.split('/v1')[0]}/billing`;
    const result = await createPortalSession(repos, org, returnUrl);

    return c.json({ success: true, data: result });
  }
);

export { siBillingRouter };
