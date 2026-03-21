/**
 * Admin Impersonation Routes
 *
 * POST /v1/admin/impersonate     — Start impersonation session
 * POST /v1/admin/end-impersonation — End impersonation session
 *
 * Creates short-lived HS256 JWTs signed with SUPABASE_JWT_SECRET.
 * The impersonation token contains dual identity claims so the
 * impersonation middleware can enforce read-only restrictions.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { sign } from 'hono/jwt';
import { requireAdminPermission } from '../../../middleware/admin-permissions.ts';
import { requireRecentAuth } from '../../../middleware/step-up-auth.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { getEnv } from '../../../lib/env.ts';
import { buildAuditContext } from './utils/audit-context.ts';
import type { AppEnv } from '../../../types/index.ts';

const IMPERSONATION_TTL_SECONDS = 30 * 60; // 30 minutes

const adminImpersonateRouter = new OpenAPIHono<AppEnv>();

// ============================================================================
// POST /v1/admin/impersonate — Start impersonation
// ============================================================================

const impersonateBodySchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
  reason: z.string().min(1, 'reason is required').max(500),
});

adminImpersonateRouter.openapi(
  createRoute({
    method: 'post',
    path: '/impersonate',
    tags: ['Admin', 'Impersonation'],
    summary: 'Start Impersonation',
    description: 'Start a read-only impersonation session for a target user.',
    middleware: routeMiddleware(
      requireAdminPermission('impersonate:read_only'),
      requireRecentAuth(5)
    ),
    request: {
      body: {
        content: {
          'application/json': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            schema: impersonateBodySchema as any,
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
              data: z.object({
                token: z.string(),
                expiresAt: z.string(),
                impersonatedUser: z.object({
                  id: z.string(),
                  name: z.string(),
                  email: z.string(),
                  org: z.string(),
                }),
                mode: z.string(),
              }),
            }),
          },
        },
        description: 'Impersonation session started',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    if (!actor) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const { targetUserId, reason } = c.req.valid('json');

    // Look up the target user
    const targetUser = await c.var.repos.users.findById(targetUserId);
    if (!targetUser) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Target user not found', 404);
    }

    // Prevent impersonating other admins
    if (targetUser.role === 'system_admin') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Cannot impersonate system administrators', 403);
    }

    // Get the target user's organization for the response
    const targetOrg = await c.var.repos.organizations.findById(targetUser.organizationId);

    // Get JWT secret
    const jwtSecret =
      getEnv('APP_JWT_SECRET') || getEnv('SUPABASE_JWT_SECRET') || getEnv('JWT_SECRET');
    if (!jwtSecret) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'JWT secret not configured', 500);
    }

    // Create impersonation JWT
    const now = Math.floor(Date.now() / 1000);
    const exp = now + IMPERSONATION_TTL_SECONDS;

    const token = await sign(
      {
        sub: targetUser.supabaseUserId,
        realUserId: actor.id,
        realSubject: actor.supabaseUserId,
        impersonationMode: 'read_only',
        reason,
        iss: 'revbrain-impersonation',
        iat: now,
        exp,
      },
      jwtSecret,
      'HS256'
    );

    const expiresAt = new Date(exp * 1000).toISOString();

    // Audit log
    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: targetUser.organizationId,
        action: 'impersonation.started',
        targetUserId: targetUser.id,
        metadata: {
          requestId: auditCtx.requestId,
          reason,
          targetEmail: targetUser.email,
          mode: 'read_only',
          expiresAt,
        },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({
      success: true,
      data: {
        token,
        expiresAt,
        impersonatedUser: {
          id: targetUser.id,
          name: targetUser.fullName,
          email: targetUser.email,
          org: targetOrg?.name || targetUser.organizationId,
        },
        mode: 'read_only',
      },
    });
  }
);

// ============================================================================
// POST /v1/admin/end-impersonation — End impersonation
// ============================================================================

const endImpersonationBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

adminImpersonateRouter.openapi(
  createRoute({
    method: 'post',
    path: '/end-impersonation',
    tags: ['Admin', 'Impersonation'],
    summary: 'End Impersonation',
    description: 'End an active impersonation session.',
    request: {
      body: {
        content: {
          'application/json': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            schema: endImpersonationBodySchema as any,
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
              message: z.string(),
            }),
          },
        },
        description: 'Impersonation session ended',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    if (!actor) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const body = c.req.valid('json');

    // The realUser (admin) may be set by impersonation middleware
    const realUser = c.get('realUser');

    // Audit log
    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: realUser?.id || auditCtx.actorId,
        organizationId: actor.organizationId,
        action: 'impersonation.ended',
        targetUserId: actor.id,
        metadata: {
          requestId: auditCtx.requestId,
          reason: body.reason || 'Session ended by admin',
        },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({
      success: true,
      message: 'Impersonation session ended',
    });
  }
);

export { adminImpersonateRouter };
