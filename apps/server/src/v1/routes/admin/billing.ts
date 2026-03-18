/**
 * Admin Billing Routes
 *
 * Admin-only endpoints for billing management including refunds.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { BillingService } from '../../../services/billing.service.ts';
import { formatAmount } from '../../../lib/stripe.ts';
import type { AppEnv } from '../../../types/index.ts';

// Validation schemas
const issueRefundSchema = z.object({
  paymentId: z.string().uuid(),
  amountCents: z.number().int().positive().optional(),
  reason: z.string().min(3).max(500),
});

const adminBillingRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/billing/payments/:id — Get payment details
 */
adminBillingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/payments/{id}',
    tags: ['Admin', 'Billing'],
    summary: 'Get Payment Details',
    description: 'Fetch detailed payment information including refund status.',
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
              data: z.any(),
            }),
          },
        },
        description: 'Payment details',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const billingService = new BillingService();
    const payment = await billingService.getPaymentById(id);

    if (!payment) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Payment not found', 404);
    }

    const refundableAmountCents = payment.amountCents - (payment.refundedAmountCents || 0);

    return c.json({
      success: true,
      data: {
        id: payment.id,
        organizationId: payment.organizationId,
        stripeInvoiceId: payment.stripeInvoiceId,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        amount: formatAmount(payment.amountCents, payment.currency),
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        refundedAmount: payment.refundedAmountCents
          ? formatAmount(payment.refundedAmountCents, payment.currency)
          : null,
        refundedAmountCents: payment.refundedAmountCents,
        refundedAt: payment.refundedAt?.toISOString() || null,
        refundReason: payment.refundReason,
        refundableAmount: formatAmount(refundableAmountCents, payment.currency),
        refundableAmountCents,
        createdAt: payment.createdAt.toISOString(),
      },
    });
  }
);

/**
 * POST /v1/admin/billing/refund — Issue a refund
 */
adminBillingRouter.openapi(
  createRoute({
    method: 'post',
    path: '/refund',
    tags: ['Admin', 'Billing'],
    summary: 'Issue Refund',
    description: 'Issue a full or partial refund for a payment. Requires system_admin role.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: issueRefundSchema,
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
              message: z.string(),
            }),
          },
        },
        description: 'Refund processed successfully',
      },
    },
  }),
  async (c) => {
    const { user } = c.var;
    const input = c.req.valid('json');

    const billingService = new BillingService();

    // First check if payment exists
    const payment = await billingService.getPaymentById(input.paymentId);
    if (!payment) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Payment not found', 404);
    }

    try {
      const result = await billingService.issueRefund({
        paymentId: input.paymentId,
        amountCents: input.amountCents,
        reason: input.reason,
        actorId: user.id,
      });

      return c.json({
        success: true,
        data: {
          refundId: result.refundId,
          amountRefunded: result.amountRefunded,
          amountRefundedFormatted: formatAmount(result.amountRefunded, payment.currency),
          isFullRefund: result.isFullRefund,
        },
        message: result.isFullRefund
          ? 'Full refund processed successfully'
          : 'Partial refund processed successfully',
      });
    } catch (err) {
      if (err instanceof Error) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, err.message, 400);
      }
      throw err;
    }
  }
);

export { adminBillingRouter };
