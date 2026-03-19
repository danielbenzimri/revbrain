/**
 * Mock Ticket Repository
 *
 * In-memory CRUD for support tickets and messages.
 */
import {
  mockTickets,
  mockTicketMessages,
  mockUsers,
  mockOrganizations,
  type SeedTicket,
  type SeedTicketMessage,
} from '../../mocks/index.ts';
import { generateId, applyPagination, applySorting } from './helpers.ts';

export class MockTicketRepository {
  async findMany(options?: {
    filter?: {
      status?: string;
      priority?: string;
      category?: string;
      assignedTo?: string;
      search?: string;
    };
    limit?: number;
    offset?: number;
    orderBy?: { field: string; direction: 'asc' | 'desc' };
  }) {
    let items = [...mockTickets];

    // Apply filters
    if (options?.filter) {
      const { status, priority, category, assignedTo, search } = options.filter;
      if (status) items = items.filter((t) => t.status === status);
      if (priority) items = items.filter((t) => t.priority === priority);
      if (category) items = items.filter((t) => t.category === category);
      if (assignedTo) items = items.filter((t) => t.assignedTo === assignedTo);
      if (search) {
        const s = search.toLowerCase();
        items = items.filter(
          (t) => t.subject.toLowerCase().includes(s) || t.description.toLowerCase().includes(s)
        );
      }
    }

    // Sort
    const field = (options?.orderBy?.field as keyof SeedTicket) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');

    const total = items.length;
    items = applyPagination(items, options);

    // Enrich with user/org data
    const enriched = items.map((t) => this.enrichTicket(t));

    return {
      tickets: enriched,
      pagination: {
        total,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
        hasMore: (options?.offset || 0) + items.length < total,
      },
    };
  }

  async findById(id: string) {
    const ticket = mockTickets.find((t) => t.id === id);
    if (!ticket) return null;

    const enriched = this.enrichTicket(ticket);
    const messages = mockTicketMessages
      .filter((m) => m.ticketId === id)
      .map((m) => ({ ...m }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { ...enriched, messages };
  }

  async create(data: Partial<SeedTicket>): Promise<SeedTicket> {
    const now = new Date();
    const ticketNumber = `TK-${String(mockTickets.length + 1).padStart(3, '0')}`;
    const entity: SeedTicket = {
      id: generateId(),
      ticketNumber,
      subject: data.subject || '',
      description: data.description || '',
      status: data.status || 'open',
      priority: data.priority || 'medium',
      category: data.category || 'general',
      userId: data.userId || '',
      organizationId: data.organizationId || '',
      assignedTo: data.assignedTo || null,
      createdAt: now,
      updatedAt: now,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
    };
    mockTickets.push(entity);
    return entity;
  }

  async update(id: string, data: Partial<SeedTicket>): Promise<SeedTicket | null> {
    const idx = mockTickets.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const updated = { ...mockTickets[idx], ...data, updatedAt: new Date() };

    if (data.status === 'resolved' && !mockTickets[idx].resolvedAt) {
      updated.resolvedAt = new Date();
    }
    if (data.status === 'closed' && !mockTickets[idx].closedAt) {
      updated.closedAt = new Date();
    }

    mockTickets[idx] = updated;
    return updated;
  }

  async getStats() {
    const all = mockTickets;
    return {
      total: all.length,
      open: all.filter((t) => t.status === 'open').length,
      inProgress: all.filter((t) => t.status === 'in_progress').length,
      waitingCustomer: all.filter((t) => t.status === 'waiting_customer').length,
      resolved: all.filter((t) => t.status === 'resolved').length,
      closed: all.filter((t) => t.status === 'closed').length,
      highPriority: all.filter(
        (t) => (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'closed'
      ).length,
    };
  }

  async addMessage(data: {
    ticketId: string;
    content: string;
    senderType: 'user' | 'admin' | 'system';
    senderName: string;
    isInternal: boolean;
  }): Promise<SeedTicketMessage> {
    const message: SeedTicketMessage = {
      id: generateId(),
      ticketId: data.ticketId,
      content: data.content,
      senderType: data.senderType,
      senderName: data.senderName,
      isInternal: data.isInternal,
      createdAt: new Date(),
      attachments: [],
    };
    mockTicketMessages.push(message);

    // Update firstResponseAt if this is the first admin reply
    if (data.senderType === 'admin') {
      const ticket = mockTickets.find((t) => t.id === data.ticketId);
      if (ticket && !ticket.firstResponseAt) {
        ticket.firstResponseAt = new Date();
      }
    }

    return message;
  }

  async findMessages(ticketId: string): Promise<SeedTicketMessage[]> {
    return mockTicketMessages
      .filter((m) => m.ticketId === ticketId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private enrichTicket(t: SeedTicket) {
    const user = mockUsers.find((u) => u.id === t.userId);
    const org = mockOrganizations.find((o) => o.id === t.organizationId);
    const assignee = t.assignedTo ? mockUsers.find((u) => u.id === t.assignedTo) : null;

    return {
      ...t,
      user: user ? { id: user.id, fullName: user.fullName, email: user.email } : null,
      organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
      assignedTo: assignee ? { id: assignee.id, fullName: assignee.fullName } : null,
    };
  }
}
