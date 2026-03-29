import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes, onboardOrganizationSchema } from '@revbrain/contract';
import type { AppEnv } from '../../../types/index.ts';
import type { RequestContext } from '../../../services/types.ts';
import { getClientIpOrNull } from '../../../lib/request-ip.ts';
import { buildAuditContext } from './utils/audit-context.ts';

const onboardingRouter = new OpenAPIHono<AppEnv>();

/**
 * POST /v1/admin/onboard
 */
onboardingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/onboard',
    tags: ['Admin'],
    summary: 'Onboard Organization',
    description: 'System admin onboards a new organization + first admin user.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema type incompatible with Hono OpenAPI expected type
            schema: onboardOrganizationSchema as any,
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
                organization: z.any(),
                admin: z.any(),
                invitationSent: z.boolean(),
              }),
            }),
          },
        },
        description: 'Organization created successfully',
      },
    },
  }),
  async (c) => {
    const actor = c.get('user');
    if (!actor) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const input = c.req.valid('json') as z.infer<typeof onboardOrganizationSchema>;
    const ctx: RequestContext = {
      actorId: actor.id,
      actorEmail: actor.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    let result;
    try {
      result = await c.var.services.onboarding.onboardOrganization(input, ctx);
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, `Onboard failed: ${msg}`, 500);
    }

    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: result.organization.id,
        action: 'tenant.onboarded',
        targetUserId: result.admin.id,
        metadata: {
          requestId: auditCtx.requestId,
          organizationName: result.organization.name,
          adminEmail: result.admin.email,
        },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json(
      {
        success: true,
        data: {
          organization: {
            id: result.organization.id,
            name: result.organization.name,
            slug: result.organization.slug,
            type: result.organization.type,
            seatLimit: result.organization.seatLimit,
            seatUsed: result.organization.seatUsed,
          },
          admin: {
            id: result.admin.id,
            email: result.admin.email,
            fullName: result.admin.fullName,
            role: result.admin.role,
            isOrgAdmin: result.admin.isOrgAdmin,
            isActive: result.admin.isActive,
          },
          invitationSent: result.invitationSent,
        },
      },
      201
    );
  }
);

export { onboardingRouter };
