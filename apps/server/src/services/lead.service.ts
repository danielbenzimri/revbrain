/**
 * Lead Service
 *
 * Handles enterprise lead capture, CRM operations, and conversion.
 */
import {
  db,
  leads,
  leadActivities,
  auditLogs,
  eq,
  desc,
  and,
  or,
  gte,
  lte,
  ilike,
  sql,
} from '@revbrain/database';
import { getEmailService } from '../emails/index.ts';
import {
  renderLeadNotificationEmail,
  renderLeadConfirmationEmail,
} from '../emails/templates/index.ts';
import { logger } from '../lib/logger.ts';
import { getEnv } from '../lib/env.ts';

export interface CreateLeadInput {
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  companyName?: string;
  companySize?: string;
  message?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface UpdateLeadInput {
  status?: string;
  notes?: string;
  interestLevel?: string;
  estimatedValue?: number;
  nextFollowUpAt?: Date | null;
  assignedTo?: string | null;
  scheduledAt?: Date | null;
  calendlyEventUri?: string | null;
}

export interface LeadFilters {
  status?: string | string[];
  search?: string;
  assignedTo?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface LeadStats {
  total: number;
  byStatus: Record<string, number>;
  thisWeek: number;
  needsFollowUp: number;
}

export class LeadService {
  /**
   * Submit a new lead from the contact form.
   * This is a public endpoint - no auth required.
   */
  async submitLead(input: CreateLeadInput) {
    // Create the lead
    const [lead] = await db
      .insert(leads)
      .values({
        contactName: input.contactName,
        contactEmail: input.contactEmail.toLowerCase().trim(),
        contactPhone: input.contactPhone,
        companyName: input.companyName,
        companySize: input.companySize,
        message: input.message,
        source: input.source || 'website',
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        status: 'new',
      })
      .returning();

    logger.info('Lead submitted', { leadId: lead.id, email: lead.contactEmail });

    // Audit log the lead submission (public endpoint, no user)
    await db.insert(auditLogs).values({
      userId: null,
      organizationId: null,
      action: 'lead.submitted',
      metadata: {
        leadId: lead.id,
        contactEmail: lead.contactEmail,
        companyName: lead.companyName || null,
        source: lead.source,
      },
    });

    // Send notification email to sales team
    await this.sendNotificationEmail(lead);

    // Send confirmation email to lead
    await this.sendConfirmationEmail(lead);

    return lead;
  }

  /**
   * Send notification email to sales team.
   */
  private async sendNotificationEmail(lead: typeof leads.$inferSelect) {
    const salesEmail = getEnv('SALES_NOTIFICATION_EMAIL') || 'sales@revbrain.com';
    const emailService = getEmailService();

    try {
      const html = renderLeadNotificationEmail({
        leadName: lead.contactName,
        leadEmail: lead.contactEmail,
        leadPhone: lead.contactPhone || 'Not provided',
        companyName: lead.companyName || 'Not provided',
        companySize: lead.companySize || 'Not provided',
        message: lead.message || 'No message',
        source: lead.source || 'website',
        dashboardUrl: `${getEnv('APP_URL') || 'https://app.revbrain.com'}/admin/leads/${lead.id}`,
      });

      await emailService.send({
        to: salesEmail,
        subject: `New Enterprise Lead: ${lead.companyName || lead.contactName}`,
        html,
      });

      logger.info('Lead notification email sent', { leadId: lead.id, to: salesEmail });
    } catch (error) {
      logger.error('Failed to send lead notification email', { leadId: lead.id }, error as Error);
    }
  }

  /**
   * Send confirmation email to the lead.
   */
  private async sendConfirmationEmail(lead: typeof leads.$inferSelect) {
    const emailService = getEmailService();
    const calendlyUrl = getEnv('CALENDLY_BOOKING_URL');

    try {
      const html = renderLeadConfirmationEmail({
        leadName: lead.contactName,
        calendlyUrl: calendlyUrl || undefined,
      });

      await emailService.send({
        to: lead.contactEmail,
        subject: 'Thanks for contacting RevBrain!',
        html,
      });

      logger.info('Lead confirmation email sent', { leadId: lead.id, to: lead.contactEmail });
    } catch (error) {
      logger.error('Failed to send lead confirmation email', { leadId: lead.id }, error as Error);
    }
  }

  /**
   * Get lead by ID with activities.
   */
  async getLeadById(id: string) {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, id),
      with: {
        assignedToUser: true,
        activities: {
          orderBy: desc(leadActivities.createdAt),
          with: {
            createdByUser: true,
          },
        },
      },
    });

    return lead;
  }

  /**
   * List leads with filters and pagination.
   */
  async listLeads(filters?: LeadFilters, limit = 50, offset = 0) {
    const conditions = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(or(...filters.status.map((s) => eq(leads.status, s))));
      } else {
        conditions.push(eq(leads.status, filters.status));
      }
    }

    if (filters?.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(leads.contactName, searchPattern),
          ilike(leads.contactEmail, searchPattern),
          ilike(leads.companyName, searchPattern)
        )
      );
    }

    if (filters?.assignedTo) {
      conditions.push(eq(leads.assignedTo, filters.assignedTo));
    }

    if (filters?.fromDate) {
      conditions.push(gte(leads.createdAt, filters.fromDate));
    }

    if (filters?.toDate) {
      conditions.push(lte(leads.createdAt, filters.toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [leadsList, countResult] = await Promise.all([
      db.query.leads.findMany({
        where: whereClause,
        orderBy: desc(leads.createdAt),
        limit,
        offset,
        with: {
          assignedToUser: true,
        },
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(whereClause),
    ]);

    return {
      leads: leadsList,
      total: countResult[0]?.count || 0,
    };
  }

  /**
   * Update a lead.
   */
  async updateLead(id: string, input: UpdateLeadInput, actorId?: string) {
    const existing = await db.query.leads.findFirst({
      where: eq(leads.id, id),
    });

    if (!existing) {
      throw new Error('Lead not found');
    }

    // Track status change for activity log
    const statusChanged = input.status && input.status !== existing.status;

    const [updated] = await db
      .update(leads)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, id))
      .returning();

    // Log status change activity
    if (statusChanged && actorId) {
      await this.addActivity(id, {
        activityType: 'status_change',
        title: `Status changed to ${input.status}`,
        description: `Changed from "${existing.status}" to "${input.status}"`,
        metadata: { oldStatus: existing.status, newStatus: input.status },
        createdBy: actorId,
      });
    }

    // Audit log the update
    await db.insert(auditLogs).values({
      userId: actorId || null,
      organizationId: null, // Leads are system-level
      action: 'lead.updated',
      metadata: {
        leadId: id,
        contactEmail: existing.contactEmail,
        changes: input,
        statusChanged: statusChanged || false,
      },
    });

    return updated;
  }

  /**
   * Add an activity to a lead.
   */
  async addActivity(
    leadId: string,
    input: {
      activityType: string;
      title: string;
      description?: string;
      metadata?: Record<string, unknown>;
      createdBy?: string;
    }
  ) {
    const [activity] = await db
      .insert(leadActivities)
      .values({
        leadId,
        activityType: input.activityType,
        title: input.title,
        description: input.description,
        metadata: input.metadata,
        createdBy: input.createdBy,
      })
      .returning();

    return activity;
  }

  /**
   * Get pipeline statistics.
   */
  async getStats(): Promise<LeadStats> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [allLeads, weekLeads, followUpLeads] = await Promise.all([
      db
        .select({ status: leads.status, count: sql<number>`count(*)::int` })
        .from(leads)
        .groupBy(leads.status),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(gte(leads.createdAt, weekAgo)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(
          and(
            lte(leads.nextFollowUpAt, now),
            or(
              eq(leads.status, 'new'),
              eq(leads.status, 'contacted'),
              eq(leads.status, 'qualified'),
              eq(leads.status, 'demo_scheduled'),
              eq(leads.status, 'proposal'),
              eq(leads.status, 'negotiation')
            )
          )
        ),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;

    for (const row of allLeads) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    return {
      total,
      byStatus,
      thisWeek: weekLeads[0]?.count || 0,
      needsFollowUp: followUpLeads[0]?.count || 0,
    };
  }

  /**
   * Convert a lead to an organization.
   * This will be implemented when we integrate with OnboardingService.
   */
  async convertLead(
    leadId: string,
    input: {
      planId: string;
    },
    actorId: string
  ) {
    const lead = await this.getLeadById(leadId);

    if (!lead) {
      throw new Error('Lead not found');
    }

    if (lead.status === 'won' || lead.status === 'lost') {
      throw new Error('Lead has already been closed');
    }

    // TODO: Use OnboardingService to create organization
    // For now, just mark as won
    await this.updateLead(leadId, { status: 'won' }, actorId);

    await this.addActivity(leadId, {
      activityType: 'converted',
      title: 'Lead converted to organization',
      metadata: { planId: input.planId },
      createdBy: actorId,
    });

    // Audit log the conversion
    await db.insert(auditLogs).values({
      userId: actorId,
      organizationId: null, // Will be linked once org is created
      action: 'lead.converted',
      metadata: {
        leadId,
        contactEmail: lead.contactEmail,
        companyName: lead.companyName || null,
        planId: input.planId,
      },
    });

    return lead;
  }
}
