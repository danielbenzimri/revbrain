/**
 * Billing Routes
 *
 * Handles subscription checkout, portal access, and billing status.
 * Requires authentication - users can only access their own org's billing.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth.ts';
import { requireActiveSubscription } from '../../middleware/limits.ts';
import { routeMiddleware } from '../../lib/middleware-types.ts';
import { BillingService } from '../../services/billing.service.ts';
import { CouponService } from '../../services/coupon.service.ts';
import { isStripeConfigured } from '../../lib/stripe.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { AppEnv } from '../../types/index.ts';

const billingRouter = new OpenAPIHono<AppEnv>();

const DEFAULT_PAYMENT_LIMIT = 10;
const MAX_PAYMENT_LIMIT = 100;

// ============================================================================
// CHECKOUT
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/checkout',
    tags: ['Billing'],
    summary: 'Create Checkout Session',
    description: 'Creates a Stripe Checkout Session for subscription purchase.',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              planId: z.string().uuid(),
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
              data: z.object({
                checkoutUrl: z.string(),
                sessionId: z.string(),
              }),
            }),
          },
        },
        description: 'Checkout session created successfully',
      },
    },
  }),
  async (c) => {
    if (!isStripeConfigured()) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Billing is not configured', 503);
    }

    const user = c.get('user');
    const { planId } = c.req.valid('json');

    const org = await c.var.repos.organizations.findById(user.organizationId);

    const billingService = new BillingService();

    try {
      const result = await billingService.createCheckoutSession({
        planId,
        organizationId: user.organizationId,
        userEmail: user.email,
        orgName: org?.name || 'Organization',
      });

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        err instanceof Error ? err.message : 'Failed to create checkout session',
        400
      );
    }
  }
);

// ============================================================================
// PORTAL
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/portal',
    tags: ['Billing'],
    summary: 'Create Customer Portal Session',
    description:
      'Creates a Stripe Customer Portal session for managing billing. Requires active subscription.',
    middleware: routeMiddleware(authMiddleware, requireActiveSubscription()),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                portalUrl: z.string(),
              }),
            }),
          },
        },
        description: 'Portal session created successfully',
      },
    },
  }),
  async (c) => {
    if (!isStripeConfigured()) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Billing is not configured', 503);
    }

    const user = c.get('user');
    const billingService = new BillingService();

    try {
      const result = await billingService.createPortalSession(user.organizationId);

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        err instanceof Error ? err.message : 'Failed to create portal session',
        400
      );
    }
  }
);

// ============================================================================
// SUBSCRIPTION
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/subscription',
    tags: ['Billing'],
    summary: 'Get Subscription Status',
    description: 'Returns the current subscription status for the organization.',
    middleware: routeMiddleware(authMiddleware),
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
        description: 'Subscription status retrieved',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const billingService = new BillingService();

    const result = await billingService.getSubscription(user.organizationId);

    return c.json({
      success: true,
      data: result,
    });
  }
);

// ============================================================================
// PAYMENTS
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/payments',
    tags: ['Billing'],
    summary: 'Get Payment History',
    description: 'Returns paginated payment history for the organization.',
    middleware: routeMiddleware(authMiddleware),
    request: {
      query: z.object({
        limit: z.coerce.number().min(1).max(MAX_PAYMENT_LIMIT).optional(),
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
        description: 'Payment history retrieved',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const { limit, offset } = c.req.valid('query');
    const parsedLimit = Math.min(limit || DEFAULT_PAYMENT_LIMIT, MAX_PAYMENT_LIMIT);
    const parsedOffset = offset || 0;

    const billingService = new BillingService();
    const result = await billingService.getPaymentHistory(user.organizationId, {
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return c.json({
      success: true,
      data: result.payments,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: result.hasMore,
      },
    });
  }
);

// ============================================================================
// USAGE
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/usage',
    tags: ['Billing'],
    summary: 'Get Usage Statistics',
    description: 'Returns current usage statistics including users, projects, and storage.',
    middleware: routeMiddleware(authMiddleware),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                users: z.object({
                  used: z.number(),
                  limit: z.number(),
                  percentage: z.number(),
                }),
                projects: z.object({
                  used: z.number(),
                  limit: z.number(),
                  percentage: z.number(),
                }),
                storage: z.object({
                  usedGB: z.number(),
                  limitGB: z.number(),
                  percentage: z.number(),
                }),
                features: z.any().nullable(),
                subscription: z
                  .object({
                    status: z.string(),
                    planName: z.string(),
                    planCode: z.string(),
                  })
                  .nullable(),
              }),
            }),
          },
        },
        description: 'Usage statistics retrieved',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const limitsService = c.var.services.limits;

    const usage = await limitsService.getUsageStats(user.organizationId);

    return c.json({
      success: true,
      data: usage,
    });
  }
);

// ============================================================================
// VALIDATE COUPON
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/validate-coupon',
    tags: ['Billing'],
    summary: 'Validate Coupon Code',
    description: 'Validates a coupon code before checkout.',
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              code: z.string().min(1),
              planId: z.string().uuid(),
              amountCents: z.number().optional(),
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
        description: 'Coupon validation result',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const { code, planId, amountCents } = c.req.valid('json');

    const couponService = new CouponService();
    const result = await couponService.validateCoupon(
      code,
      user.organizationId,
      planId,
      amountCents || 0
    );

    return c.json({
      success: true,
      data: result,
    });
  }
);

// ============================================================================
// CHANGE PLAN
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/change-plan',
    tags: ['Billing'],
    summary: 'Change Subscription Plan',
    description: 'Changes the subscription to a different plan. Requires active subscription.',
    middleware: routeMiddleware(authMiddleware, requireActiveSubscription()),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              planId: z.string().uuid(),
              prorationBehavior: z.enum(['create_prorations', 'none', 'always_invoice']).optional(),
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
        description: 'Plan changed successfully',
      },
    },
  }),
  async (c) => {
    if (!isStripeConfigured()) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Billing is not configured', 503);
    }

    const user = c.get('user');
    const { planId, prorationBehavior } = c.req.valid('json');

    const billingService = new BillingService();

    try {
      const result = await billingService.changePlan(user.organizationId, planId, {
        prorationBehavior,
        actorId: user.id,
      });

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        err instanceof Error ? err.message : 'Failed to change plan',
        400
      );
    }
  }
);

// ============================================================================
// CANCEL
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/cancel',
    tags: ['Billing'],
    summary: 'Cancel Subscription',
    description: 'Cancels the current subscription. By default, cancels at period end.',
    middleware: routeMiddleware(authMiddleware, requireActiveSubscription()),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              cancelImmediately: z.boolean().optional(),
              reason: z.string().optional(),
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
        description: 'Subscription canceled',
      },
    },
  }),
  async (c) => {
    if (!isStripeConfigured()) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Billing is not configured', 503);
    }

    const user = c.get('user');
    const { cancelImmediately, reason } = c.req.valid('json');

    const billingService = new BillingService();

    try {
      const result = await billingService.cancelSubscription(user.organizationId, {
        cancelImmediately,
        reason,
        actorId: user.id,
      });

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        err instanceof Error ? err.message : 'Failed to cancel subscription',
        400
      );
    }
  }
);

// ============================================================================
// REACTIVATE
// ============================================================================

billingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/reactivate',
    tags: ['Billing'],
    summary: 'Reactivate Subscription',
    description: 'Reactivates a subscription scheduled to cancel at period end.',
    middleware: routeMiddleware(authMiddleware),
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
        description: 'Subscription reactivated',
      },
    },
  }),
  async (c) => {
    if (!isStripeConfigured()) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Billing is not configured', 503);
    }

    const user = c.get('user');
    const billingService = new BillingService();

    try {
      const result = await billingService.reactivateSubscription(user.organizationId, {
        actorId: user.id,
      });

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        err instanceof Error ? err.message : 'Failed to reactivate subscription',
        400
      );
    }
  }
);

export { billingRouter };
