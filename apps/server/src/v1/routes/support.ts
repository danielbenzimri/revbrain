/**
 * Support Routes
 *
 * User-facing support ticket management.
 * Users can create, view, and reply to their own tickets.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth.ts';
import { listLimiter } from '../../middleware/rate-limit.ts';
import { AppError, ErrorCodes } from '@geometrix/contract';
import { TicketService } from '../../services/ticket.service.ts';
import type { AppEnv } from '../../types/index.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const supportRouter = new OpenAPIHono<AppEnv>();

/**
 * POST /v1/support/tickets - Create a new support ticket
 */
supportRouter.openapi(
  createRoute({
    method: 'post',
    path: '/tickets',
    tags: ['Support'],
    summary: 'Create Support Ticket',
    description: 'Create a new support ticket.',
    middleware: [authMiddleware] as any,
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              subject: z.string().min(5).max(255),
              description: z.string().max(5000).optional(),
              category: z
                .enum(['billing', 'technical', 'feature_request', 'account', 'other'])
                .optional(),
              priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
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
              data: z.any(),
            }),
          },
        },
        description: 'Ticket created successfully',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const ticketService = new TicketService();
    const ticket = await ticketService.createTicket({
      ...input,
      userId: user.id,
      organizationId: user.organizationId,
    });

    return c.json(
      {
        success: true,
        data: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          createdAt: ticket.createdAt,
        },
      },
      201
    );
  }
);

/**
 * GET /v1/support/tickets - List user's tickets
 */
supportRouter.openapi(
  createRoute({
    method: 'get',
    path: '/tickets',
    tags: ['Support'],
    summary: 'List My Tickets',
    description: 'List support tickets for the current user.',
    middleware: [authMiddleware, listLimiter] as any,
    request: {
      query: z.object({
        limit: z.coerce.number().min(1).max(MAX_LIMIT).optional(),
        offset: z.coerce.number().min(0).optional(),
        status: z.string().optional(),
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
                hasMore: z.boolean(),
              }),
            }),
          },
        },
        description: 'List of tickets',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const { limit = DEFAULT_LIMIT, offset = 0, status } = c.req.query();
    const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedOffset = Number(offset) || 0;

    const ticketService = new TicketService();
    const result = await ticketService.listTickets(
      {
        userId: user.id,
        status: status || undefined,
      },
      { limit: parsedLimit, offset: parsedOffset }
    );

    return c.json({
      success: true,
      data: result.tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        category: t.category,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  }
);

/**
 * GET /v1/support/tickets/:id - Get ticket details
 */
supportRouter.openapi(
  createRoute({
    method: 'get',
    path: '/tickets/{id}',
    tags: ['Support'],
    summary: 'Get Ticket Details',
    description: 'Get details of a support ticket including messages.',
    middleware: [authMiddleware] as any,
    request: {
      params: z.object({
        id: z.string().uuid('Invalid ticket ID'),
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
        description: 'Ticket details',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');

    const ticketService = new TicketService();
    const ticket = await ticketService.getTicketById(id, { includeInternal: false });

    if (!ticket) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Ticket not found', 404);
    }

    // Verify ownership
    if (ticket.userId !== user.id && ticket.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    return c.json({
      success: true,
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
        messages: ticket.messages.map((m) => ({
          id: m.id,
          content: m.content,
          senderType: m.senderType,
          senderName: m.sender?.fullName || 'Support',
          createdAt: m.createdAt,
          attachments: m.attachments,
        })),
      },
    });
  }
);

/**
 * POST /v1/support/tickets/:id/messages - Add a message to a ticket
 */
supportRouter.openapi(
  createRoute({
    method: 'post',
    path: '/tickets/{id}/messages',
    tags: ['Support'],
    summary: 'Reply to Ticket',
    description: 'Add a message/reply to an existing ticket.',
    middleware: [authMiddleware] as any,
    request: {
      params: z.object({
        id: z.string().uuid('Invalid ticket ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              content: z.string().min(1).max(5000),
              attachments: z.array(z.string()).optional(),
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
              data: z.any(),
            }),
          },
        },
        description: 'Message added',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const ticketService = new TicketService();
    const ticket = await ticketService.getTicketById(id);

    if (!ticket) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Ticket not found', 404);
    }

    // Verify ownership
    if (ticket.userId !== user.id) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Don't allow messages on closed tickets
    if (ticket.status === 'closed') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Cannot reply to a closed ticket', 400);
    }

    const message = await ticketService.addMessage({
      ticketId: id,
      senderId: user.id,
      senderType: 'user',
      content: input.content,
      attachments: input.attachments,
    });

    return c.json(
      {
        success: true,
        data: {
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
        },
      },
      201
    );
  }
);

/**
 * PUT /v1/support/tickets/:id/close - Close a ticket
 */
supportRouter.openapi(
  createRoute({
    method: 'put',
    path: '/tickets/{id}/close',
    tags: ['Support'],
    summary: 'Close Ticket',
    description: 'Close a support ticket (user can close their own tickets).',
    middleware: [authMiddleware] as any,
    request: {
      params: z.object({
        id: z.string().uuid('Invalid ticket ID'),
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
        description: 'Ticket closed',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');

    const ticketService = new TicketService();
    const ticket = await ticketService.getTicketById(id);

    if (!ticket) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Ticket not found', 404);
    }

    // Verify ownership
    if (ticket.userId !== user.id) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    await ticketService.closeTicket(id, user.id);

    return c.json({
      success: true,
      message: 'Ticket closed',
    });
  }
);

export { supportRouter };
