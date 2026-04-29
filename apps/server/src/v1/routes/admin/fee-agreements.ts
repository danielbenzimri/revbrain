/**
 * Admin Fee Agreement Routes (SI Billing)
 *
 * CRUD + lifecycle + amendment endpoints for fee agreements.
 * All routes require system_admin role.
 *
 * Task: P3.2, P3.3
 * Refs: SI-BILLING-SPEC.md §14.3, §11
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import {
  transition,
  createAmendment,
  type CancelPayload,
  type CompletePayload,
} from '../../../services/agreement-state-machine.ts';
import {
  transitionMilestone,
  voidAllPending,
  autoInvoiceCompleted,
} from '../../../services/milestone-state-machine.ts';
import {
  calculateMigrationFee,
  generateDefaultBrackets,
} from '../../../services/fee-calculator.ts';
import { buildAuditContext } from './utils/audit-context.ts';
import type { AppEnv } from '../../../types/index.ts';

const adminFeeAgreementsRouter = new OpenAPIHono<AppEnv>();

// Also create the admin billing router (initially empty — P8.1/P8.1b add cron endpoints)
const adminBillingCronRouter = new OpenAPIHono<AppEnv>();
export { adminBillingCronRouter };

/**
 * POST /v1/admin/fee-agreements — Create draft agreement
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              projectId: z.string().uuid(),
              assessmentFee: z.number().int().positive().default(1_500_000),
              paymentTerms: z
                .enum(['due_on_receipt', 'net_15', 'net_30', 'net_60'])
                .default('net_30'),
              capAmount: z.number().int().positive().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: { 201: { description: 'Agreement created' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const body = await c.req.json();
    const audit = buildAuditContext(c);

    // Validate cap >= assessment_fee
    if (body.capAmount && body.capAmount < body.assessmentFee) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Cap amount must be >= assessment fee', 400);
    }

    // Create draft agreement
    const agreement = await repos.feeAgreements.create({
      projectId: body.projectId,
      assessmentFee: body.assessmentFee ?? 1_500_000,
      paymentTerms: body.paymentTerms ?? 'net_30',
      capAmount: body.capAmount ?? null,
      createdBy: audit.actorId ?? undefined,
    });

    // Create default rate brackets
    const brackets = generateDefaultBrackets();
    await repos.feeAgreementTiers.createMany(
      brackets.map((b, i) => ({
        feeAgreementId: agreement.id,
        bracketCeiling: b.ceiling,
        rateBps: b.rateBps,
        sortOrder: (i + 1) * 100,
      }))
    );

    // Audit
    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.created',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: {
        requestId: audit.requestId,
        agreementId: agreement.id,
        projectId: body.projectId,
      },
    });

    return c.json({ success: true, data: agreement }, 201);
  }
);

/**
 * GET /v1/admin/fee-agreements/:id — Agreement detail with milestones + tiers
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Agreement detail' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }

    const milestones = await repos.feeMilestones.findByAgreementId(id);
    const tiers = await repos.feeAgreementTiers.findByAgreementId(id);

    return c.json({ success: true, data: { agreement, milestones, tiers } });
  }
);

/**
 * PUT /v1/admin/fee-agreements/:id — Update agreement (draft only)
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'put',
    path: '/:id',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              assessmentFee: z.number().int().positive().optional(),
              paymentTerms: z.enum(['due_on_receipt', 'net_15', 'net_30', 'net_60']).optional(),
              capAmount: z.number().int().positive().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Agreement updated' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }

    if (agreement.status !== 'draft') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Can only update draft agreements', 400);
    }

    const updated = await repos.feeAgreements.update(id, body);
    return c.json({ success: true, data: updated });
  }
);

/**
 * POST /v1/admin/fee-agreements/:id/approve-migration — Admin approves >$500K value
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:id/approve-migration',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Migration approved' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const audit = buildAuditContext(c);

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }

    // Use state machine for validation
    const update = transition(agreement, 'APPROVE_MIGRATION') as Record<string, unknown>;

    // Compute migration fee and generate milestones
    const tiers = await repos.feeAgreementTiers.findByAgreementId(id);
    const brackets = tiers.map((t) => ({ ceiling: t.bracketCeiling, rateBps: t.rateBps }));
    const assessmentCredit = agreement.assessmentFee;

    const feeResult = calculateMigrationFee({
      declaredValue: agreement.declaredProjectValue!,
      brackets,
      assessmentCredit,
      capAmount: agreement.capAmount,
    });

    // Update agreement with calculated fees
    await repos.feeAgreements.update(id, {
      ...update,
      calculatedTotalFee: feeResult.totalFee,
      calculatedRemainingFee: feeResult.remainingFee,
    });

    // Generate migration milestones if remaining > 0
    if (feeResult.remainingFee > 0) {
      await repos.feeMilestones.createMany(
        feeResult.milestones.map((m, i) => ({
          feeAgreementId: id,
          name: m.name,
          phase: 'migration',
          triggerType: i === 0 ? 'automatic' : 'admin_approved',
          percentageBps: m.percentageBps,
          amount: m.amount,
          status: 'pending',
          sortOrder: (i + 2) * 100, // M2=200, M3=300, M4=400
        }))
      );
    }

    // Audit
    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.migration_approved',
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
 * POST /v1/admin/fee-agreements/:id/request-value-revision — Admin requests SI to revise value
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:id/request-value-revision',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Revision requested' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const audit = buildAuditContext(c);

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }

    const update = transition(agreement, 'REQUEST_REVISION') as Record<string, unknown>;
    await repos.feeAgreements.update(id, update);

    // Audit
    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.value_revision_requested',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: { requestId: audit.requestId, agreementId: id },
    });

    return c.json({ success: true });
  }
);

/**
 * POST /v1/admin/fee-agreements/:id/amend — Atomic amendment (cancel old + create new)
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:id/amend',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Amendment created' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const audit = buildAuditContext(c);

    const oldAgreement = await repos.feeAgreements.findById(id);
    if (!oldAgreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }

    // Get M1 paid amount from old agreement
    const oldMilestones = await repos.feeMilestones.findByAgreementId(id);
    const m1 = oldMilestones.find((m) => m.phase === 'assessment' && m.status === 'paid');
    const assessmentFeePaid = m1?.amount ?? oldAgreement.assessmentFee;

    // Cancel old agreement
    const cancelUpdate = transition(oldAgreement, 'CANCEL', {
      cancelledBy: audit.actorId ?? 'system',
      cancellationReason: 'Superseded by amendment',
    } as CancelPayload) as Record<string, unknown>;
    await repos.feeAgreements.update(id, cancelUpdate);

    // Void pending milestones on old agreement
    const toVoid = voidAllPending(oldMilestones);
    for (const v of toVoid) {
      await repos.feeMilestones.update(v.id, v.update);
    }

    // Auto-invoice completed milestones
    const toInvoice = autoInvoiceCompleted(oldMilestones);
    for (const inv of toInvoice) {
      await repos.feeMilestones.update(inv.id, inv.update);
    }

    // Create new agreement version
    const { newAgreementData, m1Milestone } = createAmendment({
      oldAgreement,
      assessmentFeePaid,
    });

    const newAgreement = await repos.feeAgreements.create({
      projectId: newAgreementData.projectId!,
      assessmentFee: newAgreementData.assessmentFee!,
      paymentTerms: newAgreementData.paymentTerms,
      capAmount: newAgreementData.capAmount,
      supersedesAgreementId: newAgreementData.supersedesAgreementId,
      version: newAgreementData.version,
      carriedCreditAmount: newAgreementData.carriedCreditAmount,
      carriedCreditSourceAgreementId: newAgreementData.carriedCreditSourceAgreementId,
    });

    // Update new agreement to active_assessment (skip draft)
    await repos.feeAgreements.update(newAgreement.id, {
      status: 'active_assessment',
      acceptedBy: newAgreementData.acceptedBy,
      acceptedAt: newAgreementData.acceptedAt,
      acceptedFromIp: newAgreementData.acceptedFromIp,
      assessmentTermsSnapshot: newAgreementData.assessmentTermsSnapshot,
      assessmentTermsSnapshotHash: newAgreementData.assessmentTermsSnapshotHash,
    });

    // Create M1 with carried credit
    await repos.feeMilestones.create({
      feeAgreementId: newAgreement.id,
      name: m1Milestone.name,
      phase: m1Milestone.phase,
      triggerType: m1Milestone.triggerType,
      amount: m1Milestone.amount,
      status: m1Milestone.status,
      paidVia: m1Milestone.paidVia,
      sortOrder: m1Milestone.sortOrder,
    });

    // Copy brackets from old agreement
    const oldTiers = await repos.feeAgreementTiers.findByAgreementId(id);
    await repos.feeAgreementTiers.createMany(
      oldTiers.map((t) => ({
        feeAgreementId: newAgreement.id,
        bracketCeiling: t.bracketCeiling,
        rateBps: t.rateBps,
        sortOrder: t.sortOrder,
      }))
    );

    // Audit
    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.amended',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: {
        requestId: audit.requestId,
        oldAgreementId: id,
        newAgreementId: newAgreement.id,
        version: newAgreementData.version,
        carriedCredit: assessmentFeePaid,
      },
    });

    return c.json({ success: true, data: { oldAgreementId: id, newAgreement } });
  }
);

/**
 * POST /v1/admin/fee-agreements/:id/complete — Mark zero-fee agreement complete
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:id/complete',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Agreement completed' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const audit = buildAuditContext(c);

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }

    const milestones = await repos.feeMilestones.findByAgreementId(id);
    const allPaid = milestones
      .filter((m) => m.status !== 'voided')
      .every((m) => m.status === 'paid');
    const hasZeroFee = (agreement.calculatedRemainingFee ?? 0) === 0;

    const update = transition(agreement, 'COMPLETE', {
      allMilestonesPaid: allPaid,
      hasZeroFee,
    } as CompletePayload) as Record<string, unknown>;

    await repos.feeAgreements.update(id, update);

    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.completed',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: { requestId: audit.requestId, agreementId: id, zeroFee: hasZeroFee },
    });

    return c.json({ success: true });
  }
);

/**
 * POST /v1/admin/fee-agreements/:id/cancel — Cancel agreement
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:id/cancel',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              reason: z.string().min(3).max(500),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Agreement cancelled' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();
    const audit = buildAuditContext(c);

    const agreement = await repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }

    const update = transition(agreement, 'CANCEL', {
      cancelledBy: audit.actorId ?? 'system',
      cancellationReason: body.reason,
    } as CancelPayload) as Record<string, unknown>;

    await repos.feeAgreements.update(id, update);

    // Void pending milestones + auto-invoice completed (Stripe wiring stubbed for P6)
    const milestones = await repos.feeMilestones.findByAgreementId(id);
    const toInvoice = autoInvoiceCompleted(milestones);
    for (const inv of toInvoice) {
      await repos.feeMilestones.update(inv.id, inv.update);
    }
    const toVoid = voidAllPending(milestones);
    for (const v of toVoid) {
      await repos.feeMilestones.update(v.id, v.update);
    }

    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'fee_agreement.cancelled',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: { requestId: audit.requestId, agreementId: id, reason: body.reason },
    });

    return c.json({ success: true });
  }
);

/**
 * GET /v1/admin/fee-agreements/:id/sow-url — Get signed URL for SOW download
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/:id/sow-url',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'SOW signed URL' } },
  }),
  async (c) => {
    const id = c.req.param('id');
    const agreement = await c.var.repos.feeAgreements.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Fee agreement not found', 404);
    }
    if (!agreement.sowFileId) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No SOW uploaded for this agreement', 404);
    }

    // In production, this would generate a signed URL from Supabase Storage
    // For now, return the file ID (Stripe/storage wiring comes in P6)
    return c.json({
      success: true,
      data: {
        sowFileId: agreement.sowFileId,
        url: `/storage/sow-documents/${agreement.sowFileId}`,
      },
    });
  }
);

// ============================================================================
// MILESTONE SUB-ROUTES (P3.3)
// ============================================================================

/**
 * POST /v1/admin/milestones/:id/approve — Admin approves milestone
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/milestones/:id/approve',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Milestone approved' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const audit = buildAuditContext(c);

    const milestone = await repos.feeMilestones.findById(id);
    if (!milestone) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Milestone not found', 404);
    }

    const update = transitionMilestone(milestone, 'APPROVE', {
      completedBy: audit.actorId ?? 'system',
    });

    await repos.feeMilestones.update(id, update);

    // Generate invoice (stub — Stripe wiring in P6.3b)
    const invoiceUpdate = transitionMilestone(
      { ...milestone, ...update } as any,
      'GENERATE_INVOICE'
    );
    await repos.feeMilestones.update(id, invoiceUpdate);

    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'milestone.approved',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: { requestId: audit.requestId, milestoneId: id, milestoneName: milestone.name },
    });

    return c.json({ success: true });
  }
);

/**
 * POST /v1/admin/milestones/:id/reject — Admin rejects milestone request
 */
adminFeeAgreementsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/milestones/:id/reject',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              reason: z.string().min(3).max(500),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Milestone rejected' } },
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

    const update = transitionMilestone(milestone, 'REJECT', {
      rejectionReason: body.reason,
    });

    await repos.feeMilestones.update(id, update);

    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'milestone.rejected',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: { requestId: audit.requestId, milestoneId: id, reason: body.reason },
    });

    return c.json({ success: true });
  }
);

export { adminFeeAgreementsRouter };
