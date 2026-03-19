import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { MockOverrideRepository } from '../../../repositories/mock/index.ts';
import type { AppEnv } from '../../../types/index.ts';
import { buildAuditContext } from './utils/audit-context.ts';

const overrideRepo = new MockOverrideRepository();

// Validation schemas
const overrideCreateSchema = z.object({
  feature: z.string().min(1).max(100),
  value: z.unknown().default(true),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().min(1).max(500),
});

const adminOverridesRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/tenants/:orgId/overrides — List active overrides for a tenant
 */
adminOverridesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/tenants/{orgId}/overrides',
    tags: ['Admin', 'Overrides'],
    summary: 'List Tenant Overrides',
    description: 'Fetch active (non-revoked, non-expired) overrides for a tenant.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        orgId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
            }),
          },
        },
        description: 'Active overrides for the tenant',
      },
    },
  }),
  async (c) => {
    const { orgId } = c.req.param();
    const overrides = await overrideRepo.findByOrganization(orgId);

    return c.json({
      success: true,
      data: overrides,
    });
  }
);

/**
 * POST /v1/admin/tenants/:orgId/overrides — Grant a feature override
 */
adminOverridesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/tenants/{orgId}/overrides',
    tags: ['Admin', 'Overrides'],
    summary: 'Grant Override',
    description: 'Grant a feature override for a specific tenant.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        orgId: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: overrideCreateSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Override granted',
      },
    },
  }),
  async (c) => {
    const { orgId } = c.req.param();
    const input = c.req.valid('json');
    const actor = c.get('user');

    const override = await overrideRepo.create({
      organizationId: orgId,
      feature: input.feature,
      value: input.value,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      grantedBy: actor?.id || '',
      reason: input.reason,
    });

    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: orgId,
        action: 'admin.override_granted',
        targetUserId: null,
        metadata: {
          requestId: auditCtx.requestId,
          overrideId: override.id,
          feature: input.feature,
          reason: input.reason,
        },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({ success: true, data: override }, 201);
  }
);

/**
 * DELETE /v1/admin/overrides/:id — Revoke an override
 */
adminOverridesRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/overrides/{id}',
    tags: ['Admin', 'Overrides'],
    summary: 'Revoke Override',
    description: 'Revoke a tenant feature override.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
        description: 'Override revoked',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.param();

    const existing = await overrideRepo.findById(id);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Override not found', 404);
    }

    if (existing.revokedAt) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Override already revoked', 400);
    }

    const revoked = await overrideRepo.revoke(id);

    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: existing.organizationId,
        action: 'admin.override_revoked',
        targetUserId: null,
        metadata: {
          requestId: auditCtx.requestId,
          overrideId: id,
          feature: existing.feature,
        },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({
      success: true,
      message: 'Override revoked',
    });
  }
);

export { adminOverridesRouter };
