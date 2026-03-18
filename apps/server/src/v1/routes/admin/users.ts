import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter, listLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes, inviteUserSchema } from '@revbrain/contract';
import type { AdminUpdateUserInput } from '../../../services/user.service.ts';
import type { AppEnv } from '../../../types/index.ts';
import type { RequestContext } from '../../../services/types.ts';
import { getClientIpOrNull } from '../../../lib/request-ip.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const adminUsersRouter = new OpenAPIHono<AppEnv>();

/**
 * POST /v1/admin/users — Invite user to any organization
 */
adminUsersRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Admin'],
    summary: 'Invite User',
    description: 'System admin invites a user to any organization.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema type incompatible with Hono OpenAPI expected type
            schema: inviteUserSchema as any,
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
        description: 'User invited successfully',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    if (!actor) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const input = c.req.valid('json') as z.infer<typeof inviteUserSchema>;
    const ctx: RequestContext = {
      actorId: actor.id,
      actorEmail: actor.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    // Resolve target organization
    let org;
    if (input.role === 'system_admin' && !input.organizationId) {
      org = await c.var.services.organizations.getOrCreatePlatformOrg(actor.id);
    } else {
      if (!input.organizationId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'organizationId is required', 400);
      }
      org = await c.var.repos.organizations.findById(input.organizationId);
      if (!org) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);
      }
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
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role,
          isActive: result.user.isActive,
        },
      },
      201
    );
  }
);

/**
 * GET /v1/admin/users — List all users with pagination
 */
adminUsersRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin'],
    summary: 'List All Users',
    description: 'Fetch users with their organization details. Supports pagination.',
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
        description: 'List of users with pagination',
      },
    },
  }),
  async (c) => {
    const { limit = DEFAULT_LIMIT, offset = 0 } = c.req.query();
    const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedOffset = Number(offset) || 0;

    const result = await c.var.services.users.listUsers({
      limit: parsedLimit,
      offset: parsedOffset,
    });

    const usersList = result.users.map((u) => ({
      id: u.id,
      name: u.fullName || 'Unknown',
      email: u.email,
      role: u.role,
      status: u.isActive ? 'active' : 'pending',
      avatar: u.fullName
        ? u.fullName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase()
        : '??',
      color:
        u.role === 'system_admin'
          ? 'bg-purple-500'
          : u.role.includes('client')
            ? 'bg-blue-500'
            : 'bg-violet-500',
      createdAt: u.createdAt,
      jobTitle: u.jobTitle,
      phoneNumber: u.phoneNumber,
      address: u.address,
      age: u.age,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      mobileNumber: u.mobileNumber,
      preferences: u.preferences,
      lastLoginAt: u.lastLoginAt,
    }));

    return c.json({
      success: true,
      data: usersList,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: result.hasMore,
      },
    });
  }
);

/**
 * PUT /v1/admin/users/:id — Update user profile
 */
adminUsersRouter.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Admin'],
    summary: 'Update User',
    description: 'Update user profile details.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid('Invalid user ID format'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().min(2).max(255).optional(),
              role: z.string().max(50).optional(),
              jobTitle: z.string().max(100).nullable().optional(),
              phoneNumber: z.string().max(20).nullable().optional(),
              mobileNumber: z.string().max(20).nullable().optional(),
              address: z.string().max(500).nullable().optional(),
              age: z.number().int().min(0).max(150).nullable().optional(),
              bio: z.string().max(500).nullable().optional(),
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
        description: 'User updated',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json') as AdminUpdateUserInput;

    const ctx: RequestContext = {
      actorId: actor?.id || 'system',
      actorEmail: actor?.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    const updated = await c.var.services.users.adminUpdateUser(id, input, ctx);

    return c.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.fullName,
        email: updated.email,
        role: updated.role,
        jobTitle: updated.jobTitle,
        phoneNumber: updated.phoneNumber,
        mobileNumber: updated.mobileNumber,
        address: updated.address,
        age: updated.age,
        bio: updated.bio,
      },
    });
  }
);

/**
 * DELETE /v1/admin/users/:id — Delete user
 */
adminUsersRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Admin'],
    summary: 'Delete User',
    description: 'Soft-delete a user and remove from Supabase Auth. Frees email for re-invitation.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid('Invalid user ID format'),
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
        description: 'User deleted',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    const id = c.req.param('id');

    const ctx: RequestContext = {
      actorId: actor?.id || 'system',
      actorEmail: actor?.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    await c.var.services.users.deleteUser(id, ctx, { checkOwnedProjects: true });

    return c.json({
      success: true,
      message: 'User deleted successfully',
    });
  }
);

export { adminUsersRouter };
