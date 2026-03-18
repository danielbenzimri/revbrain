/**
 * Organization Routes
 *
 * Handles org member management: inviting users, resending invites, listing users.
 * Requires authentication - users can only access their own org's data.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/rbac.ts';
import { requireUserCapacity } from '../../middleware/limits.ts';
import { inviteLimiter, listLimiter } from '../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { AppEnv } from '../../types/index.ts';
import type { RequestContext } from '../../services/types.ts';
import { getClientIpOrNull } from '../../lib/request-ip.ts';

const orgRouter = new OpenAPIHono<AppEnv>();

// ============================================================================
// INVITE USER
// ============================================================================

orgRouter.openapi(
  createRoute({
    method: 'post',
    path: '/invite',
    tags: ['Organization'],
    summary: 'Invite User',
    description: 'Invites a new user to the organization. Requires org admin role.',
    middleware: routeMiddleware(
      authMiddleware,
      requireRole('org_owner', 'org_owner', 'system_admin'),
      requireUserCapacity(),
      inviteLimiter
    ),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email(),
              fullName: z.string().min(1),
              role: z.string(),
              organizationId: z.string().uuid().optional(),
              phoneNumber: z.string().optional(),
              jobTitle: z.string().optional(),
              address: z.string().optional(),
            }),
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
              data: z.object({
                user: z.object({
                  id: z.string().uuid(),
                  email: z.string(),
                  fullName: z.string(),
                  role: z.string(),
                }),
                seatsRemaining: z.number(),
                warning: z.string().nullable(),
              }),
            }),
          },
        },
        description: 'User invited successfully',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    if (!actor) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const input = c.req.valid('json');
    const ctx: RequestContext = {
      actorId: actor.id,
      actorEmail: actor.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    // Resolve target organization
    let targetOrgId = actor.organizationId;
    if (actor.role === 'system_admin' && input.organizationId) {
      targetOrgId = input.organizationId;
    }

    const org = await c.var.repos.organizations.findById(targetOrgId);
    if (!org) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);
    }

    const result = await c.var.services.users.inviteUser(
      {
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        organizationId: org.id,
        phoneNumber: input.phoneNumber,
        jobTitle: input.jobTitle,
        address: input.address,
      },
      actor.role,
      org,
      ctx
    );

    return c.json(
      {
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            fullName: result.user.fullName,
            role: result.user.role,
          },
          seatsRemaining: result.seatsRemaining,
          warning: result.warning || null,
        },
      },
      201
    );
  }
);

// ============================================================================
// RESEND INVITE
// ============================================================================

orgRouter.openapi(
  createRoute({
    method: 'post',
    path: '/invite/resend',
    tags: ['Organization'],
    summary: 'Resend Invitation',
    description: 'Resends invitation email to a user who has not yet activated their account.',
    middleware: routeMiddleware(authMiddleware, requireRole('org_owner', 'admin'), inviteLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              userId: z.string().uuid(),
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
              message: z.string(),
            }),
          },
        },
        description: 'Invitation resent successfully',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    const { userId } = c.req.valid('json');

    const ctx: RequestContext = {
      actorId: actor.id,
      actorEmail: actor.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    await c.var.services.users.resendInvite(userId, actor.organizationId, ctx);

    return c.json({
      success: true,
      message: 'Invitation resent successfully',
    });
  }
);

// ============================================================================
// LIST USERS
// ============================================================================

orgRouter.openapi(
  createRoute({
    method: 'get',
    path: '/users',
    tags: ['Organization'],
    summary: 'List Organization Users',
    description: "Returns paginated list of all users in the authenticated user's organization.",
    middleware: routeMiddleware(authMiddleware, listLimiter),
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(
                z.object({
                  id: z.string().uuid(),
                  email: z.string(),
                  fullName: z.string(),
                  role: z.string(),
                  isOrgAdmin: z.boolean(),
                  isActive: z.boolean(),
                  createdAt: z.string(),
                  activatedAt: z.string().nullable(),
                  lastLoginAt: z.string().nullable(),
                })
              ),
              pagination: z.object({
                limit: z.number(),
                offset: z.number(),
                hasMore: z.boolean(),
              }),
            }),
          },
        },
        description: 'Users list retrieved successfully',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    const { limit, offset } = c.req.valid('query');
    const parsedLimit = limit || 100;
    const parsedOffset = offset || 0;

    const { users, hasMore } = await c.var.services.users.listOrgUsers(actor.organizationId, {
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return c.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isOrgAdmin: u.isOrgAdmin,
        isActive: u.isActive,
        createdAt: u.createdAt,
        activatedAt: u.activatedAt,
        lastLoginAt: u.lastLoginAt,
      })),
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore,
      },
    });
  }
);

export { orgRouter };
