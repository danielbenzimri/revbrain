import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import { db, plans, eq } from '@revbrain/database';
import { authMiddleware } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/rbac.ts';
import { validateUuidParam } from '../../middleware/validate-uuid.ts';
import { AppError, ErrorCodes, planSchema } from '@revbrain/contract';
import { logger } from '../../lib/logger.ts';
import { getStripe, isStripeConfigured } from '../../lib/stripe.ts';

import { type AppEnv } from '../../types/index.ts';

/**
 * Sync a plan to Stripe - creates Product and Price
 * Only syncs if Stripe is configured and plan is public
 */
async function syncPlanToStripe(plan: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
}): Promise<{ stripeProductId: string; stripePriceId: string } | null> {
  if (!isStripeConfigured()) {
    logger.info('Stripe not configured, skipping plan sync');
    return null;
  }

  try {
    const stripe = getStripe();

    // Create Stripe Product
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
      metadata: {
        app_plan_id: plan.id,
        app_plan_code: plan.code,
      },
    });

    // Create Stripe Price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price,
      currency: plan.currency.toLowerCase(),
      recurring: {
        interval: plan.interval as 'month' | 'year',
      },
      metadata: {
        app_plan_id: plan.id,
        app_plan_code: plan.code,
      },
    });

    logger.info('Plan synced to Stripe', {
      planId: plan.id,
      stripeProductId: product.id,
      stripePriceId: price.id,
    });

    return {
      stripeProductId: product.id,
      stripePriceId: price.id,
    };
  } catch (error) {
    logger.error('Failed to sync plan to Stripe', { planId: plan.id }, error as Error);
    return null;
  }
}

const plansRouter = new OpenAPIHono<AppEnv>();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /v1/plans
 * List plans with pagination.
 */
plansRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Plans'],
    summary: 'List Subscription Plans',
    description:
      'Returns a list of available subscription plans. System admins see all plans; regular users see only public active plans. Supports pagination.',
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema type incompatible with Hono OpenAPI expected type
              data: z.array(planSchema as any),
              pagination: z.object({
                limit: z.number(),
                offset: z.number(),
                hasMore: z.boolean(),
              }),
            }),
          },
        },
        description: 'List of plans with pagination',
      },
    },
  }),
  async (c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hono OpenAPI context type mismatch with middleware parameter
    await authMiddleware(c as any, async () => {});

    const actor = c.get('user');

    if (!actor) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const { limit = DEFAULT_LIMIT, offset = 0 } = c.req.query();
    const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedOffset = Number(offset) || 0;

    const isSystemAdmin = actor.role === 'system_admin';

    // Fetch one extra to determine hasMore
    const fetchLimit = parsedLimit + 1;

    const result = isSystemAdmin
      ? await c.var.repos.plans.findMany({
          orderBy: { field: 'price', direction: 'desc' },
          limit: fetchLimit,
          offset: parsedOffset,
        })
      : await c.var.repos.plans.findPublic({ limit: fetchLimit, offset: parsedOffset });

    const hasMore = result.length > parsedLimit;
    const data = hasMore ? result.slice(0, parsedLimit) : result;

    return c.json({
      success: true,
      data,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore,
      },
    });
  }
);

/**
 * POST /v1/plans
 * Create a new plan (System Admin only)
 */
plansRouter.post(
  '/',
  authMiddleware,
  requireRole('system_admin'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema type incompatible with zValidator expected type
  zValidator('json', planSchema as any),
  async (c) => {
    const input = c.req.valid('json');
    const requestId = c.get('requestId');

    // Check for duplicate name
    const existingByName = await c.var.repos.plans.findByName(input.name);
    if (existingByName) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'A plan with this name already exists', 409);
    }

    // Check for duplicate code (if provided)
    if (input.code) {
      const existingByCode = await c.var.repos.plans.findByCode(input.code);
      if (existingByCode) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Plan with this code already exists', 409);
      }
    }

    try {
      const newPlan = await c.var.repos.plans.create({
        ...input,
        description: input.description || null,
      });

      logger.info('Plan created', { requestId, planId: newPlan.id, code: newPlan.code });

      // Auto-sync to Stripe if plan is public (available for purchase)
      if (input.isPublic) {
        const stripeIds = await syncPlanToStripe({
          id: newPlan.id,
          name: newPlan.name,
          code: newPlan.code,
          description: newPlan.description,
          price: newPlan.price,
          currency: newPlan.currency,
          interval: newPlan.interval,
        });

        if (stripeIds) {
          // Update plan with Stripe IDs
          await db
            .update(plans)
            .set({
              stripeProductId: stripeIds.stripeProductId,
              stripePriceId: stripeIds.stripePriceId,
            })
            .where(eq(plans.id, newPlan.id));

          logger.info('Plan updated with Stripe IDs', {
            requestId,
            planId: newPlan.id,
            stripeProductId: stripeIds.stripeProductId,
            stripePriceId: stripeIds.stripePriceId,
          });
        }
      }

      return c.json(
        {
          success: true,
          data: newPlan,
        },
        201
      );
    } catch (error) {
      logger.error('Plan creation failed', { requestId, code: input.code }, error as Error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to create plan', 500);
    }
  }
);

/**
 * PUT /v1/plans/:id
 * Update a plan (System Admin only)
 */
plansRouter.put(
  '/:id',
  validateUuidParam(),
  authMiddleware,
  requireRole('system_admin'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema type incompatible with zValidator expected type
  zValidator('json', planSchema.partial() as any),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const existing = await c.var.repos.plans.findById(id);

    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Plan not found', 404);
    }

    // Check for duplicate name (if name is being changed)
    if (input.name && input.name !== existing.name) {
      const existingByName = await c.var.repos.plans.findByName(input.name);
      if (existingByName) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          'A plan with this name already exists',
          409
        );
      }
    }

    const updatedPlan = await c.var.repos.plans.update(id, input);

    // If plan is becoming public and doesn't have Stripe IDs, sync to Stripe
    if (updatedPlan && input.isPublic === true) {
      // Check if plan has Stripe IDs by querying the database directly
      const planWithStripe = await db.query.plans.findFirst({
        where: eq(plans.id, id),
        columns: { stripePriceId: true },
      });

      if (!planWithStripe?.stripePriceId) {
        const stripeIds = await syncPlanToStripe({
          id: updatedPlan.id,
          name: updatedPlan.name,
          code: updatedPlan.code,
          description: updatedPlan.description,
          price: updatedPlan.price,
          currency: updatedPlan.currency,
          interval: updatedPlan.interval,
        });

        if (stripeIds) {
          await db
            .update(plans)
            .set({
              stripeProductId: stripeIds.stripeProductId,
              stripePriceId: stripeIds.stripePriceId,
            })
            .where(eq(plans.id, id));

          logger.info('Plan synced to Stripe on publish', {
            planId: id,
            stripeProductId: stripeIds.stripeProductId,
            stripePriceId: stripeIds.stripePriceId,
          });
        }
      }
    }

    return c.json({
      success: true,
      data: updatedPlan,
    });
  }
);

/**
 * DELETE /v1/plans/:id
 * Delete (or archive) a plan.
 * Soft-deletes by marking as inactive and private.
 */
plansRouter.delete(
  '/:id',
  validateUuidParam(),
  authMiddleware,
  requireRole('system_admin'),
  async (c) => {
    const id = c.req.param('id');
    const requestId = c.get('requestId');

    try {
      await c.var.repos.plans.update(id, {
        isActive: false,
        isPublic: false,
      });

      logger.info('Plan archived', { requestId, planId: id });

      return c.json({
        success: true,
        message: 'Plan archived',
      });
    } catch (error) {
      logger.error('Plan deletion failed', { requestId, planId: id }, error as Error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Could not delete plan', 500);
    }
  }
);

export { plansRouter };
