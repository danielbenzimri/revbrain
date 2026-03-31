/**
 * Admin Support Routes
 *
 * Admin-only ticket management.
 * Admins can view all tickets, update status, assign agents, and add internal notes.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter, listLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { TicketService, type UpdateTicketInput } from '../../../services/ticket.service.ts';
import type { AppEnv } from '../../../types/index.ts';
import { buildAuditContext } from './utils/audit-context.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const adminSupportRouter = new OpenAPIHono<AppEnv>();

/**
 * GET /v1/admin/support/tickets - List all tickets
 */
adminSupportRouter.openapi(
  createRoute({
    method: 'get',
    path: '/tickets',
    tags: ['Admin Support'],
    summary: 'List All Tickets',
    description: 'List all support tickets with filters and pagination.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), listLimiter),
    request: {
      query: z.object({
        limit: z.coerce.number().min(1).max(MAX_LIMIT).optional(),
        offset: z.coerce.number().min(0).optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        category: z.string().optional(),
        assignedTo: z.string().optional(),
        search: z.string().optional(),
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
    const {
      limit = DEFAULT_LIMIT,
      offset = 0,
      status,
      priority,
      category,
      assignedTo,
      search,
    } = c.req.query();
    const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedOffset = Number(offset) || 0;

    // Validate enum filter values
    const VALID_STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
    const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    if (status && !VALID_STATUSES.includes(status)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid status: ${status}`, 400);
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid priority: ${priority}`, 400);
    }

    const ticketService = new TicketService();
    const result = await ticketService.listTickets(
      {
        status: status || undefined,
        priority: priority || undefined,
        category: category || undefined,
        assignedTo: assignedTo || undefined,
        search: search || undefined,
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
        user: t.user
          ? {
              id: t.user.id,
              fullName: t.user.fullName,
              email: t.user.email,
            }
          : null,
        organization: t.organization
          ? {
              id: t.organization.id,
              name: t.organization.name,
            }
          : null,
        assignedTo: t.assignedToUser
          ? {
              id: t.assignedToUser.id,
              fullName: t.assignedToUser.fullName,
            }
          : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        firstResponseAt: t.firstResponseAt,
        // SLA indicator: overdue if open/in_progress and no first response within 4 hours
        isOverdue:
          !t.firstResponseAt &&
          ['open', 'in_progress'].includes(t.status) &&
          Date.now() - new Date(t.createdAt).getTime() > 4 * 60 * 60 * 1000,
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
 * GET /v1/admin/support/stats - Get ticket statistics
 */
adminSupportRouter.openapi(
  createRoute({
    method: 'get',
    path: '/stats',
    tags: ['Admin Support'],
    summary: 'Get Ticket Statistics',
    description: 'Get aggregate statistics for support tickets.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), adminLimiter),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                total: z.number(),
                open: z.number(),
                inProgress: z.number(),
                waitingCustomer: z.number(),
                resolved: z.number(),
                closed: z.number(),
                highPriority: z.number(),
              }),
            }),
          },
        },
        description: 'Ticket statistics',
      },
    },
  }),
  async (c) => {
    const ticketService = new TicketService();
    const stats = await ticketService.getStats();

    return c.json({
      success: true,
      data: stats,
    });
  }
);

/**
 * GET /v1/admin/support/tickets/:id - Get ticket details
 */
adminSupportRouter.openapi(
  createRoute({
    method: 'get',
    path: '/tickets/{id}',
    tags: ['Admin Support'],
    summary: 'Get Ticket Details',
    description: 'Get full ticket details including internal notes.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), adminLimiter),
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
    const id = c.req.param('id');

    const ticketService = new TicketService();
    const ticket = await ticketService.getTicketById(id, { includeInternal: true });

    if (!ticket) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Ticket not found', 404);
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
        user: ticket.user
          ? {
              id: ticket.user.id,
              fullName: ticket.user.fullName,
              email: ticket.user.email,
            }
          : null,
        organization: ticket.organization
          ? {
              id: ticket.organization.id,
              name: ticket.organization.name,
              slug: ticket.organization.slug,
            }
          : null,
        assignedTo: ticket.assignedToUser
          ? {
              id: ticket.assignedToUser.id,
              fullName: ticket.assignedToUser.fullName,
            }
          : null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        firstResponseAt: ticket.firstResponseAt,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
        messages: ticket.messages.map((m) => ({
          id: m.id,
          content: m.content,
          senderType: m.senderType,
          senderName: m.sender?.fullName || 'System',
          isInternal: m.isInternal,
          createdAt: m.createdAt,
          attachments: m.attachments,
        })),
      },
    });
  }
);

/**
 * PUT /v1/admin/support/tickets/:id - Update ticket
 */
adminSupportRouter.openapi(
  createRoute({
    method: 'put',
    path: '/tickets/{id}',
    tags: ['Admin Support'],
    summary: 'Update Ticket',
    description: 'Update ticket status, priority, category, or assignment.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid('Invalid ticket ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              status: z
                .enum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'])
                .optional(),
              priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
              category: z.string().optional(),
              assignedTo: z.string().uuid().nullable().optional(),
              updatedAt: z.string().datetime().optional(),
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
        description: 'Ticket updated',
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const ticketService = new TicketService();

    // Fetch current ticket for before/after metadata
    const existingTicket = await ticketService.getTicketById(id, { includeInternal: false });
    const beforeStatus = existingTicket?.status ?? null;

    // Optimistic concurrency check
    if (
      input.updatedAt &&
      existingTicket &&
      existingTicket.updatedAt &&
      new Date(input.updatedAt).getTime() !== new Date(existingTicket.updatedAt).getTime()
    ) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Record was modified by another user. Please reload and try again.',
        409
      );
    }

    const ticket = await ticketService.updateTicket(id, input as UpdateTicketInput, user.id);

    try {
      const auditCtx = buildAuditContext(c);
      const metadata: Record<string, unknown> = { requestId: auditCtx.requestId, ticketId: id };
      if (input.status && beforeStatus !== input.status) {
        metadata.before = { status: beforeStatus };
        metadata.after = { status: input.status };
      }
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: null,
        action: 'ticket.status_changed',
        targetUserId: null,
        metadata,
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({
      success: true,
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        assignedTo: ticket.assignedTo,
        updatedAt: ticket.updatedAt,
      },
    });
  }
);

/**
 * POST /v1/admin/support/tickets/:id/messages - Add message/reply
 */
adminSupportRouter.openapi(
  createRoute({
    method: 'post',
    path: '/tickets/{id}/messages',
    tags: ['Admin Support'],
    summary: 'Reply to Ticket',
    description: 'Add a message to a ticket (can be internal note or customer-visible reply).',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid('Invalid ticket ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              content: z.string().min(1).max(5000),
              isInternal: z.boolean().optional(),
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
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const ticketService = new TicketService();
    const message = await ticketService.addMessage({
      ticketId: id,
      senderId: user.id,
      senderType: 'admin',
      content: input.content,
      isInternal: input.isInternal || false,
      attachments: input.attachments,
    });

    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: null,
        action: 'ticket.replied',
        targetUserId: null,
        metadata: {
          requestId: auditCtx.requestId,
          ticketId: id,
          messageId: message.id,
          isInternal: input.isInternal || false,
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
          id: message.id,
          content: message.content,
          isInternal: message.isInternal,
          createdAt: message.createdAt,
        },
      },
      201
    );
  }
);

/**
 * PUT /v1/admin/support/tickets/:id/assign - Assign ticket
 */
adminSupportRouter.openapi(
  createRoute({
    method: 'put',
    path: '/tickets/{id}/assign',
    tags: ['Admin Support'],
    summary: 'Assign Ticket',
    description: 'Assign or unassign a ticket to an admin user.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid('Invalid ticket ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              assignedTo: z.string().uuid().nullable(),
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
        description: 'Ticket assigned',
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id');
    const { assignedTo } = c.req.valid('json');
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const ticketService = new TicketService();
    await ticketService.assignTicket(id, assignedTo, user.id);

    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: null,
        action: 'ticket.assigned',
        targetUserId: assignedTo,
        metadata: { requestId: auditCtx.requestId, ticketId: id, assignedTo },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({
      success: true,
      message: assignedTo ? 'Ticket assigned' : 'Ticket unassigned',
    });
  }
);

/**
 * POST /v1/admin/support/tickets — Create ticket on behalf of customer
 */
adminSupportRouter.openapi(
  createRoute({
    method: 'post',
    path: '/tickets',
    tags: ['Admin Support'],
    summary: 'Create Ticket on Behalf',
    description:
      'Admin creates a support ticket on behalf of a customer (e.g., from phone/email report).',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin', 'org_owner'), adminLimiter),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              subject: z.string().min(1).max(200),
              description: z.string().min(1).max(5000),
              priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
              category: z.string().max(50).optional(),
              onBehalfOfUserId: z.string().uuid(),
              organizationId: z.string().uuid(),
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
        description: 'Ticket created',
      },
    },
  }),
  async (c) => {
    const input = c.req.valid('json');
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const ticketService = new TicketService();
    const ticket = await ticketService.createTicket({
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      category: input.category || 'general',
      userId: input.onBehalfOfUserId,
      organizationId: input.organizationId,
    });

    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: input.organizationId,
        action: 'ticket.created_on_behalf',
        targetUserId: input.onBehalfOfUserId,
        metadata: {
          requestId: auditCtx.requestId,
          ticketId: ticket.id,
          subject: input.subject,
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
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
        },
      },
      201
    );
  }
);

export { adminSupportRouter };
