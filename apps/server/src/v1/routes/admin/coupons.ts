import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter, listLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { CouponService } from '../../../services/coupon.service.ts';
import type { AppEnv } from '../../../types/index.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Validation schemas
const couponCreateSchema = z.object({
  code: z.string().min(2).max(50),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().int().positive(),
  currency: z.string().length(3).default('USD'),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().nullable().default(1),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  applicablePlanIds: z.array(z.string().uuid()).default([]),
  minimumAmountCents: z.number().int().min(0).default(0),
  duration: z.enum(['once', 'forever', 'repeating']).default('once'),
  durationInMonths: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});

const couponUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().nullable().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  applicablePlanIds: z.array(z.string().uuid()).optional(),
  minimumAmountCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const adminCouponsRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/coupons — List all coupons
 */
adminCouponsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Admin', 'Coupons'],
    summary: 'List All Coupons',
    description: 'Fetch coupons with usage stats. Supports pagination.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), listLimiter),
    request: {
      query: z.object({
        limit: z.coerce.number().min(1).max(MAX_LIMIT).optional(),
        offset: z.coerce.number().min(0).optional(),
        includeInactive: z.coerce.boolean().optional(),
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
                total: z.number(),
              }),
            }),
          },
        },
        description: 'List of coupons',
      },
    },
  }),
  async (c) => {
    const { limit = DEFAULT_LIMIT, offset = 0, includeInactive } = c.req.query();
    const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedOffset = Math.max(0, Number(offset) || 0);

    const couponService = new CouponService();
    // Pagination now happens at the database level (efficient)
    const { coupons, total } = await couponService.listCoupons({
      includeInactive: includeInactive === 'true',
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return c.json({
      success: true,
      data: coupons,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total,
      },
    });
  }
);

/**
 * POST /v1/admin/coupons — Create a new coupon
 */
adminCouponsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Admin', 'Coupons'],
    summary: 'Create Coupon',
    description: 'Create a new coupon and sync to Stripe.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: couponCreateSchema,
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
        description: 'Coupon created',
      },
      409: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              error: z.object({
                code: z.string(),
                message: z.string(),
              }),
            }),
          },
        },
        description: 'Coupon code already exists',
      },
    },
  }),
  async (c) => {
    const input = c.req.valid('json');
    const actor = c.get('user');

    const couponService = new CouponService();

    try {
      const coupon = await couponService.createCoupon({
        ...input,
        validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        createdBy: actor?.id,
      });

      return c.json({ success: true, data: coupon }, 201);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, err.message, 409);
      }
      throw err;
    }
  }
);

/**
 * GET /v1/admin/coupons/:id — Get coupon details
 */
adminCouponsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Admin', 'Coupons'],
    summary: 'Get Coupon Details',
    description: 'Get coupon details with usage history.',
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
              data: z.object({
                coupon: z.any(),
                usages: z.array(z.any()),
              }),
            }),
          },
        },
        description: 'Coupon details',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.param();

    const couponService = new CouponService();
    const coupon = await couponService.getCouponById(id);

    if (!coupon) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Coupon not found', 404);
    }

    const usages = await couponService.getCouponUsages(id);

    return c.json({
      success: true,
      data: { coupon, usages },
    });
  }
);

/**
 * PUT /v1/admin/coupons/:id — Update coupon
 */
adminCouponsRouter.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Admin', 'Coupons'],
    summary: 'Update Coupon',
    description: 'Update coupon details. Note: code and discount cannot be changed after creation.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: couponUpdateSchema,
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
        description: 'Coupon updated',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.param();
    const input = c.req.valid('json');
    const user = c.get('user');

    const couponService = new CouponService();

    try {
      const updated = await couponService.updateCoupon(
        id,
        {
          ...input,
          validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        },
        user.id
      );

      return c.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Coupon not found', 404);
      }
      throw err;
    }
  }
);

/**
 * DELETE /v1/admin/coupons/:id — Deactivate coupon
 */
adminCouponsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Admin', 'Coupons'],
    summary: 'Deactivate Coupon',
    description:
      'Deactivate a coupon (soft delete). The coupon will also be deactivated in Stripe.',
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
        description: 'Coupon deactivated',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const couponService = new CouponService();

    try {
      await couponService.deleteCoupon(id, user.id);
      return c.json({
        success: true,
        message: 'Coupon deactivated',
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Coupon not found', 404);
      }
      throw err;
    }
  }
);

/**
 * POST /v1/admin/coupons/:id/sync — Force sync to Stripe
 */
adminCouponsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/sync',
    tags: ['Admin', 'Coupons'],
    summary: 'Sync Coupon to Stripe',
    description: 'Force sync coupon to Stripe. Use if initial sync failed.',
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
        description: 'Coupon synced',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.param();

    const couponService = new CouponService();

    // Verify coupon exists
    const coupon = await couponService.getCouponById(id);
    if (!coupon) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Coupon not found', 404);
    }

    try {
      await couponService.syncCouponToStripe(id);
      return c.json({
        success: true,
        message: 'Coupon synced to Stripe',
      });
    } catch (err) {
      throw new AppError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err instanceof Error ? err.message : 'Failed to sync coupon',
        500
      );
    }
  }
);

export { adminCouponsRouter };
