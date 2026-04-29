/**
 * Admin Partner Routes (SI Billing)
 *
 * Admin-only endpoints for managing SI partner organizations.
 * All routes require system_admin role.
 *
 * Task: P3.1
 * Refs: SI-BILLING-SPEC.md §14.3
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { validateOverride } from '../../../services/partner.service.ts';
import { ReconciliationService } from '../../../services/reconciliation.service.ts';
import { buildAuditContext } from './utils/audit-context.ts';
import type { AppEnv } from '../../../types/index.ts';

const adminPartnersRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/partners — List all SI partners
 */
adminPartnersRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Partner list' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const limit = Number(c.req.query('limit') ?? 100);
    const offset = Number(c.req.query('offset') ?? 0);

    const profiles = await repos.partnerProfiles.findMany({ limit, offset });

    return c.json({ success: true, data: profiles });
  }
);

/**
 * GET /v1/admin/partners/:id — Partner detail with billing summary
 */
adminPartnersRouter.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Partner detail' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');

    const profile = await repos.partnerProfiles.findById(id);
    if (!profile) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Partner profile not found', 404);
    }

    // Get active agreements for billing summary
    const agreements = await repos.feeAgreements.findByOrgId(profile.organizationId);

    return c.json({
      success: true,
      data: {
        profile,
        agreements,
      },
    });
  }
);

/**
 * PUT /v1/admin/partners/:id — Update partner (tier override)
 */
adminPartnersRouter.openapi(
  createRoute({
    method: 'put',
    path: '/:id',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              tierOverride: z.string().nullable().optional(),
              tierOverrideReason: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'Partner updated' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const id = c.req.param('id');
    const body = await c.req.json();

    const profile = await repos.partnerProfiles.findById(id);
    if (!profile) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Partner profile not found', 404);
    }

    // If setting an override, validate
    if (body.tierOverride !== undefined && body.tierOverride !== null) {
      const error = validateOverride(body.tierOverride, body.tierOverrideReason);
      if (error) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, error, 400);
      }
    }

    const audit = buildAuditContext(c);
    const updateData: Record<string, unknown> = {};

    if (body.tierOverride !== undefined) {
      updateData.tierOverride = body.tierOverride;
      updateData.tierOverrideReason = body.tierOverrideReason ?? null;
      updateData.tierOverrideSetBy = body.tierOverride ? audit.actorId : null;
      updateData.tierOverrideSetAt = body.tierOverride ? new Date() : null;
    }

    const updated = await repos.partnerProfiles.update(id, updateData);

    // Audit log
    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'partner.tier_override',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: {
        requestId: audit.requestId,
        partnerId: id,
        tierOverride: body.tierOverride,
        reason: body.tierOverrideReason,
      },
    });

    return c.json({ success: true, data: updated });
  }
);

/**
 * POST /v1/admin/partners/reconcile — Trigger manual reconciliation
 */
adminPartnersRouter.openapi(
  createRoute({
    method: 'post',
    path: '/reconcile',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    responses: { 200: { description: 'Reconciliation results' } },
  }),
  async (c) => {
    const repos = c.var.repos;
    const service = new ReconciliationService(
      repos.partnerProfiles,
      repos.feeAgreements,
      repos.feeMilestones
    );

    const summary = await service.reconcileAll();

    // Audit log
    const audit = buildAuditContext(c);
    await repos.auditLogs.create({
      userId: audit.actorId,
      action: 'partner.reconciliation',
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadata: {
        requestId: audit.requestId,
        totalPartners: summary.totalPartners,
        corrections: summary.corrections,
        alerts: summary.alerts,
      },
    });

    return c.json({ success: true, data: summary });
  }
);

export { adminPartnersRouter };
