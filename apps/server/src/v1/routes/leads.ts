/**
 * Leads Routes
 *
 * Public endpoints for lead capture (contact form submissions).
 * Rate-limited to prevent abuse.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { rateLimiter } from 'hono-rate-limiter';
import { LeadService } from '../../services/lead.service.ts';
import { AppError, ErrorCodes } from '@geometrix/contract';
import type { AppEnv } from '../../types/index.ts';
import { getClientIp } from '../../lib/request-ip.ts';

const leadsRouter = new OpenAPIHono<AppEnv>();

// Rate limiter for contact form: 5 requests per IP per hour
const contactFormLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: 'draft-6',
  keyGenerator: (c) => {
    return getClientIp(c);
  },
  handler: () => {
    throw new AppError(
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      'Too many requests. Please try again later.',
      429
    );
  },
});

// Validation schema for contact form
const contactSalesSchema = z.object({
  contactName: z.string().min(2, 'Name is required').max(255),
  contactEmail: z.string().email('Valid email is required'),
  contactPhone: z.string().max(50).optional(),
  companyName: z.string().max(255).optional(),
  companySize: z.enum(['1-10', '11-50', '51-200', '200+']).optional(),
  message: z.string().max(2000).optional(),
  // UTM tracking (optional)
  utmSource: z.string().max(255).optional(),
  utmMedium: z.string().max(255).optional(),
  utmCampaign: z.string().max(255).optional(),
});

/**
 * POST /v1/leads/contact-sales
 * Public endpoint for enterprise contact form submissions.
 * No authentication required. Rate-limited.
 */
leadsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/contact-sales',
    tags: ['Leads'],
    summary: 'Submit Enterprise Contact Form',
    description:
      'Submit a contact request for enterprise pricing. No authentication required. Rate-limited to 5 requests per hour per IP.',
    middleware: [contactFormLimiter] as any,
    request: {
      body: {
        content: {
          'application/json': {
            schema: contactSalesSchema,
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
              message: z.string(),
              data: z.object({
                calendlyUrl: z.string().nullable(),
              }),
            }),
          },
        },
        description: 'Lead submitted successfully',
      },
      400: {
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
        description: 'Validation error',
      },
      429: {
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
        description: 'Rate limit exceeded',
      },
    },
  }),
  async (c) => {
    const input = c.req.valid('json');

    const leadService = new LeadService();

    try {
      await leadService.submitLead({
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        companyName: input.companyName,
        companySize: input.companySize,
        message: input.message,
        source: 'website',
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
      });

      // Get Calendly URL from environment (if configured)
      const calendlyUrl = process.env.CALENDLY_BOOKING_URL || null;

      return c.json(
        {
          success: true,
          message: 'Thank you! We will be in touch within 1 business day.',
          data: {
            calendlyUrl,
          },
        },
        201
      );
    } catch (err) {
      throw new AppError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err instanceof Error ? err.message : 'Failed to submit contact form',
        500
      );
    }
  }
);

export { leadsRouter };
