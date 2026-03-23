/**
 * Ticket Service
 *
 * Handles support ticket CRUD, messaging, and status management.
 */
import { db } from '@revbrain/database/client';
import { supportTickets, ticketMessages, auditLogs } from '@revbrain/database';
import { eq, and, desc, sql, or, ilike } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';

export interface CreateTicketInput {
  subject: string;
  description?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  userId: string;
  organizationId: string;
}

export interface UpdateTicketInput {
  status?: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  assignedTo?: string | null;
}

export interface AddMessageInput {
  ticketId: string;
  senderId: string;
  senderType: 'user' | 'admin' | 'system';
  content: string;
  isInternal?: boolean;
  attachments?: string[];
}

export interface TicketFilters {
  status?: string | string[];
  priority?: string | string[];
  category?: string;
  assignedTo?: string;
  userId?: string;
  organizationId?: string;
  search?: string;
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  waitingCustomer: number;
  resolved: number;
  closed: number;
  highPriority: number;
}

/**
 * Generate a ticket number (fallback if DB trigger doesn't work)
 */
function generateTicketNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TIC-${timestamp}${random}`;
}

export class TicketService {
  /**
   * Create a new support ticket
   */
  async createTicket(input: CreateTicketInput): Promise<typeof supportTickets.$inferSelect> {
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        ticketNumber: generateTicketNumber(), // Fallback, DB trigger should override
        subject: input.subject,
        description: input.description,
        category: input.category || 'other',
        priority: input.priority || 'medium',
        status: 'open',
        userId: input.userId,
        organizationId: input.organizationId,
      })
      .returning();

    logger.info('Support ticket created', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      userId: input.userId,
    });

    // Audit log
    await db.insert(auditLogs).values({
      userId: input.userId,
      organizationId: input.organizationId,
      action: 'ticket.created',
      metadata: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
      },
    });

    // Add initial message if description is provided
    if (input.description) {
      await this.addMessage({
        ticketId: ticket.id,
        senderId: input.userId,
        senderType: 'user',
        content: input.description,
      });
    }

    return ticket;
  }

  /**
   * Get ticket by ID with messages
   */
  async getTicketById(id: string, options?: { includeInternal?: boolean }) {
    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, id),
      with: {
        user: true,
        organization: true,
        assignedToUser: true,
        messages: {
          where: options?.includeInternal ? undefined : eq(ticketMessages.isInternal, false),
          orderBy: desc(ticketMessages.createdAt),
          with: {
            sender: true,
          },
        },
      },
    });

    return ticket;
  }

  /**
   * Get ticket by ticket number
   */
  async getTicketByNumber(ticketNumber: string) {
    return db.query.supportTickets.findFirst({
      where: eq(supportTickets.ticketNumber, ticketNumber),
      with: {
        user: true,
        organization: true,
        assignedToUser: true,
      },
    });
  }

  /**
   * List tickets with filters and pagination
   */
  async listTickets(filters?: TicketFilters, options?: { limit?: number; offset?: number }) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const conditions = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(or(...filters.status.map((s) => eq(supportTickets.status, s))));
      } else {
        conditions.push(eq(supportTickets.status, filters.status));
      }
    }

    if (filters?.priority) {
      if (Array.isArray(filters.priority)) {
        conditions.push(or(...filters.priority.map((p) => eq(supportTickets.priority, p))));
      } else {
        conditions.push(eq(supportTickets.priority, filters.priority));
      }
    }

    if (filters?.category) {
      conditions.push(eq(supportTickets.category, filters.category));
    }

    if (filters?.assignedTo) {
      conditions.push(eq(supportTickets.assignedTo, filters.assignedTo));
    }

    if (filters?.userId) {
      conditions.push(eq(supportTickets.userId, filters.userId));
    }

    if (filters?.organizationId) {
      conditions.push(eq(supportTickets.organizationId, filters.organizationId));
    }

    if (filters?.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(supportTickets.subject, searchPattern),
          ilike(supportTickets.ticketNumber, searchPattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [tickets, countResult] = await Promise.all([
      db.query.supportTickets.findMany({
        where: whereClause,
        orderBy: desc(supportTickets.createdAt),
        limit: limit + 1,
        offset,
        with: {
          user: true,
          organization: true,
          assignedToUser: true,
        },
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTickets)
        .where(whereClause),
    ]);

    const hasMore = tickets.length > limit;
    const data = hasMore ? tickets.slice(0, limit) : tickets;

    return {
      tickets: data,
      total: countResult[0]?.count || 0,
      hasMore,
    };
  }

  /**
   * Update a ticket
   */
  async updateTicket(
    id: string,
    input: UpdateTicketInput,
    actorId?: string
  ): Promise<typeof supportTickets.$inferSelect> {
    const existing = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, id),
    });

    if (!existing) {
      throw new Error('Ticket not found');
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.status !== undefined) {
      updateData.status = input.status;

      // Track status transitions
      if (input.status === 'resolved' && existing.status !== 'resolved') {
        updateData.resolvedAt = new Date();
      }
      if (input.status === 'closed' && existing.status !== 'closed') {
        updateData.closedAt = new Date();
      }
    }

    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.category !== undefined) updateData.category = input.category;
    if (input.assignedTo !== undefined) updateData.assignedTo = input.assignedTo;

    const [updated] = await db
      .update(supportTickets)
      .set(updateData)
      .where(eq(supportTickets.id, id))
      .returning();

    // Add system message for status change
    if (input.status && input.status !== existing.status) {
      await this.addMessage({
        ticketId: id,
        senderId: actorId || existing.userId,
        senderType: actorId ? 'admin' : 'system',
        content: `Status changed from "${existing.status}" to "${input.status}"`,
        isInternal: false,
      });
    }

    // Audit log
    await db.insert(auditLogs).values({
      userId: actorId || null,
      organizationId: existing.organizationId,
      action: 'ticket.updated',
      metadata: {
        ticketId: id,
        ticketNumber: existing.ticketNumber,
        changes: input,
        previousStatus: existing.status,
        previousPriority: existing.priority,
      },
    });

    logger.info('Ticket updated', {
      ticketId: id,
      ticketNumber: existing.ticketNumber,
      changes: input,
    });

    return updated;
  }

  /**
   * Add a message to a ticket
   */
  async addMessage(input: AddMessageInput): Promise<typeof ticketMessages.$inferSelect> {
    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, input.ticketId),
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const [message] = await db
      .insert(ticketMessages)
      .values({
        ticketId: input.ticketId,
        senderId: input.senderId,
        senderType: input.senderType,
        content: input.content,
        isInternal: input.isInternal || false,
        attachments: input.attachments || [],
      })
      .returning();

    // Update ticket timestamp and track first response
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Track first admin response
    if (input.senderType === 'admin' && !input.isInternal && !ticket.firstResponseAt) {
      updateData.firstResponseAt = new Date();
    }

    // If user replies to a waiting ticket, change status back to open
    if (input.senderType === 'user' && ticket.status === 'waiting_customer') {
      updateData.status = 'open';
    }

    await db.update(supportTickets).set(updateData).where(eq(supportTickets.id, input.ticketId));

    logger.info('Message added to ticket', {
      ticketId: input.ticketId,
      messageId: message.id,
      senderType: input.senderType,
      isInternal: input.isInternal,
    });

    return message;
  }

  /**
   * Get ticket statistics
   */
  async getStats(filters?: { organizationId?: string }): Promise<TicketStats> {
    const whereClause = filters?.organizationId
      ? eq(supportTickets.organizationId, filters.organizationId)
      : undefined;

    const [statusCounts, priorityCounts] = await Promise.all([
      db
        .select({
          status: supportTickets.status,
          count: sql<number>`count(*)::int`,
        })
        .from(supportTickets)
        .where(whereClause)
        .groupBy(supportTickets.status),
      db
        .select({
          priority: supportTickets.priority,
          count: sql<number>`count(*)::int`,
        })
        .from(supportTickets)
        .where(
          and(
            whereClause,
            or(
              eq(supportTickets.status, 'open'),
              eq(supportTickets.status, 'in_progress'),
              eq(supportTickets.status, 'waiting_customer')
            )
          )
        )
        .groupBy(supportTickets.priority),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusCounts) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    const highPriorityCount = priorityCounts
      .filter((p) => p.priority === 'high' || p.priority === 'urgent')
      .reduce((sum, p) => sum + p.count, 0);

    return {
      total,
      open: byStatus['open'] || 0,
      inProgress: byStatus['in_progress'] || 0,
      waitingCustomer: byStatus['waiting_customer'] || 0,
      resolved: byStatus['resolved'] || 0,
      closed: byStatus['closed'] || 0,
      highPriority: highPriorityCount,
    };
  }

  /**
   * Close a ticket
   */
  async closeTicket(id: string, actorId: string): Promise<typeof supportTickets.$inferSelect> {
    return this.updateTicket(id, { status: 'closed' }, actorId);
  }

  /**
   * Assign a ticket to an admin
   */
  async assignTicket(
    id: string,
    assignedTo: string | null,
    actorId: string
  ): Promise<typeof supportTickets.$inferSelect> {
    const ticket = await this.updateTicket(id, { assignedTo }, actorId);

    if (assignedTo) {
      await this.addMessage({
        ticketId: id,
        senderId: actorId,
        senderType: 'system',
        content: `Ticket assigned to agent`,
        isInternal: true,
      });
    }

    return ticket;
  }
}
