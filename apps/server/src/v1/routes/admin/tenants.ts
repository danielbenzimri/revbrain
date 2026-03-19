import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter, listLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes, type UpdateOrganizationInput } from '@revbrain/contract';
import type { AppEnv } from '../../../types/index.ts';
import { buildAuditContext } from './utils/audit-context.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const adminTenantsRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/tenants — List all tenants with pagination
 */
adminTenantsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin'],
    summary: 'List All Tenants',
    description: 'Fetch tenants with plan details. Supports pagination.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), listLimiter),
    request: {
      query: z.object({
        limit: z.coerce.number().min(1).max(MAX_LIMIT).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
              pagination: z.object({
                limit: z.number(),
                offset: z.number(),
                hasMore: z.boolean(),
              }),
            }),
          },
        },
        description: 'List of tenants with pagination',
      },
    },
  }),
  async (c) => {
    const { limit = DEFAULT_LIMIT, offset = 0 } = c.req.query();
    const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedOffset = Number(offset) || 0;

    const result = await c.var.services.organizations.listTenants({
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return c.json({
      success: true,
      data: result.tenants.map((org) => ({
        id: org.id,
        name: org.name,
        type: org.type,
        slug: org.slug,
        seatLimit: org.seatLimit,
        seatUsed: org.seatUsed,
        storageUsedBytes: org.storageUsedBytes,
        isActive: org.isActive,
        createdAt: org.createdAt,
        plan: org.plan
          ? {
              id: org.plan.id,
              name: org.plan.name,
              code: org.plan.code,
            }
          : null,
      })),
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: result.hasMore,
      },
    });
  }
);

/**
 * PUT /v1/admin/tenants/:id — Update tenant
 */
adminTenantsRouter.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Admin'],
    summary: 'Update Tenant',
    description: 'Update tenant details.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid('Invalid tenant ID format'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().optional(),
              type: z.string().optional(),
              seatLimit: z.number().optional(),
              isActive: z.boolean().optional(),
              planId: z.string().uuid('Invalid plan ID format').nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'Tenant updated',
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const auditCtx = buildAuditContext(c);
    const ctx = { ...auditCtx, actorId: user.id, actorEmail: user.email };

    try {
      const updated = await c.var.services.organizations.updateTenant(
        id,
        input as UpdateOrganizationInput,
        ctx
      );

      try {
        await c.var.repos.auditLogs.create({
          userId: auditCtx.actorId,
          organizationId: id,
          action: 'tenant.updated',
          targetUserId: null,
          metadata: { requestId: auditCtx.requestId, changes: input },
          ipAddress: auditCtx.ipAddress,
          userAgent: auditCtx.userAgent,
        });
      } catch {
        /* audit failure should not block operation */
      }

      return c.json({ success: true, data: updated });
    } catch (error) {
      if (error instanceof Error && error.message === 'Tenant not found') {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Tenant not found', 404);
      }
      throw error;
    }
  }
);

/**
 * DELETE /v1/admin/tenants/:id — Deactivate tenant
 */
adminTenantsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Admin'],
    summary: 'Deactivate Tenant',
    description: 'Soft delete/deactivate a tenant.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid('Invalid tenant ID format'),
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
        description: 'Tenant deactivated',
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const auditCtx = buildAuditContext(c);
    const ctx = { ...auditCtx, actorId: user.id, actorEmail: user.email };

    await c.var.services.organizations.deactivateTenant(id, ctx);

    try {
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: id,
        action: 'tenant.deactivated',
        targetUserId: null,
        metadata: { requestId: auditCtx.requestId },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({
      success: true,
      message: 'Tenant deactivated',
    });
  }
);

export { adminTenantsRouter };
