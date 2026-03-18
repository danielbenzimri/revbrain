import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddlewareAllowInactive } from '../../middleware/auth.ts';
import { authLimiter } from '../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../lib/middleware-types.ts';
import type { AppEnv } from '../../types/index.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { RequestContext } from '../../services/types.ts';
import { getClientIpOrNull } from '../../lib/request-ip.ts';

const authRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/auth/me
 * Returns the authenticated user's profile with organization info.
 * Auto-activates inactive users on first API call after login.
 */
authRouter.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['Authentication'],
    summary: 'Get Current User',
    description:
      'Returns the authenticated user profile including organization details. Auto-activates inactive users and records login timestamp.',
    middleware: routeMiddleware(authMiddlewareAllowInactive),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                id: z.string().uuid(),
                email: z.string().email(),
                fullName: z.string(),
                role: z.string(),
                isOrgAdmin: z.boolean(),
                isActive: z.boolean(),
                organization: z
                  .object({
                    id: z.string().uuid(),
                    name: z.string(),
                    type: z.string(),
                    slug: z.string(),
                  })
                  .nullable(),
              }),
            }),
          },
        },
        description: 'User profile retrieved successfully',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const ctx: RequestContext = {
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    // Auto-activate inactive users
    if (!user.isActive) {
      await c.var.services.users.activateUser(user.id, ctx);
      user.isActive = true;
    }

    // Fetch organization details
    const org = await c.var.repos.organizations.findById(user.organizationId);

    // Record login
    await c.var.services.users.recordLogin(user.id, ctx);

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isOrgAdmin: user.isOrgAdmin,
        isActive: user.isActive,
        organization: org
          ? {
              id: org.id,
              name: org.name,
              type: org.type,
              slug: org.slug,
            }
          : null,
      },
    });
  }
);

/**
 * POST /v1/auth/activate
 * Activates a user account after they've set their password.
 */
authRouter.openapi(
  createRoute({
    method: 'post',
    path: '/activate',
    tags: ['Authentication'],
    summary: 'Activate Account',
    description:
      'Activates an inactive user account. Typically called after the user sets their password for the first time. Rate limited to prevent abuse.',
    middleware: routeMiddleware(authLimiter, authMiddlewareAllowInactive),
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
        description: 'Account activated successfully or already active',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    // Already active? No-op
    if (user.isActive) {
      return c.json({
        success: true,
        message: 'Account already active',
      });
    }

    const ctx: RequestContext = {
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    await c.var.services.users.activateUser(user.id, ctx);

    return c.json({
      success: true,
      message: 'Account activated successfully',
    });
  }
);

export { authRouter };
