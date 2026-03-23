import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeadService } from './lead.service.ts';

/**
 * Use vi.hoisted() to create mock functions that are available when vi.mock runs.
 */
const { mockFindFirst, mockFindMany, mockInsert, mockUpdate, mockSelect } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
}));

const mockEmailService = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Mock database - split across @revbrain/database/client, @revbrain/database, and drizzle-orm
 */
vi.mock('@revbrain/database/client', () => ({
  db: {
    query: {
      leads: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
      leadActivities: {
        findMany: mockFindMany,
      },
    },
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  },
}));

vi.mock('@revbrain/database', () => ({
  // Schema tables
  leads: {
    id: 'id',
    status: 'status',
    contactName: 'contact_name',
    contactEmail: 'contact_email',
    companyName: 'company_name',
    createdAt: 'created_at',
    nextFollowUpAt: 'next_follow_up_at',
    assignedTo: 'assigned_to',
  },
  leadActivities: {
    leadId: 'lead_id',
    createdAt: 'created_at',
  },
  auditLogs: {
    id: 'id',
    userId: 'user_id',
    organizationId: 'organization_id',
    action: 'action',
    metadata: 'metadata',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args) => ({ type: 'eq', args })),
  desc: vi.fn((col) => ({ type: 'desc', col })),
  and: vi.fn((...args) => ({ type: 'and', args })),
  or: vi.fn((...args) => ({ type: 'or', args })),
  gte: vi.fn((...args) => ({ type: 'gte', args })),
  lte: vi.fn((...args) => ({ type: 'lte', args })),
  ilike: vi.fn((col, pattern) => ({ type: 'ilike', col, pattern })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
}));

vi.mock('../emails/index.ts', () => ({
  getEmailService: vi.fn(() => mockEmailService),
}));

vi.mock('../emails/templates/index.ts', () => ({
  renderLeadNotificationEmail: vi.fn(() => '<html>Notification</html>'),
  renderLeadConfirmationEmail: vi.fn(() => '<html>Confirmation</html>'),
}));

vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../lib/env.ts', () => ({
  getEnv: vi.fn((key: string) => {
    const env: Record<string, string> = {
      SALES_NOTIFICATION_EMAIL: 'sales@test.com',
      APP_URL: 'https://app.test.com',
      CALENDLY_BOOKING_URL: 'https://calendly.com/test',
    };
    return env[key];
  }),
}));

describe('LeadService', () => {
  let service: LeadService;

  const mockLead = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    contactPhone: '+1234567890',
    companyName: 'Acme Corp',
    companySize: '11-50',
    message: 'Interested in enterprise',
    status: 'new',
    source: 'website',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'enterprise',
    notes: null,
    interestLevel: null,
    estimatedValue: null,
    nextFollowUpAt: null,
    assignedTo: null,
    scheduledAt: null,
    calendlyEventUri: null,
    convertedAt: null,
    convertedOrgId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockActivity = {
    id: 'activity-123',
    leadId: mockLead.id,
    activityType: 'status_change',
    title: 'Status changed to contacted',
    description: 'Changed from "new" to "contacted"',
    metadata: { oldStatus: 'new', newStatus: 'contacted' },
    createdBy: 'user-123',
    createdAt: new Date('2024-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LeadService();
  });

  describe('submitLead', () => {
    it('should create a new lead and send emails', async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLead]),
        }),
      });

      const result = await service.submitLead({
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        companyName: 'Acme Corp',
        companySize: '11-50',
        message: 'Interested in enterprise',
      });

      expect(result).toEqual(mockLead);
      expect(mockInsert).toHaveBeenCalled();
      // Email should be sent twice (notification + confirmation)
      expect(mockEmailService.send).toHaveBeenCalledTimes(2);
    });

    it('should normalize email to lowercase', async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLead]),
        }),
      });

      await service.submitLead({
        contactName: 'John Doe',
        contactEmail: 'JOHN@EXAMPLE.COM',
        companyName: 'Acme Corp',
      });

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertCall.contactEmail).toBe('john@example.com');
    });
  });

  describe('getLeadById', () => {
    it('should return lead with activities', async () => {
      const leadWithActivities = { ...mockLead, activities: [mockActivity] };
      mockFindFirst.mockResolvedValueOnce(leadWithActivities);

      const result = await service.getLeadById(mockLead.id);

      expect(result).toEqual(leadWithActivities);
      expect(mockFindFirst).toHaveBeenCalled();
    });

    it('should return undefined when lead not found', async () => {
      mockFindFirst.mockResolvedValueOnce(undefined);

      const result = await service.getLeadById('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('updateLead', () => {
    it('should update lead and return updated data', async () => {
      const updatedLead = { ...mockLead, status: 'contacted' };
      mockFindFirst.mockResolvedValueOnce(mockLead);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedLead]),
          }),
        }),
      });

      const result = await service.updateLead(mockLead.id, { status: 'contacted' });

      expect(result.status).toBe('contacted');
    });

    it('should throw error when lead not found', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await expect(service.updateLead('non-existent', { status: 'contacted' })).rejects.toThrow(
        'Lead not found'
      );
    });

    it('should log activity when status changes', async () => {
      const updatedLead = { ...mockLead, status: 'contacted' };
      mockFindFirst.mockResolvedValueOnce(mockLead);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedLead]),
          }),
        }),
      });
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockActivity]),
        }),
      });

      await service.updateLead(mockLead.id, { status: 'contacted' }, 'user-123');

      // Activity should be logged for status change
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('addActivity', () => {
    it('should create a new activity for lead', async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockActivity]),
        }),
      });

      const result = await service.addActivity(mockLead.id, {
        activityType: 'note_added',
        title: 'Note added',
        description: 'Test note',
        createdBy: 'user-123',
      });

      expect(result).toEqual(mockActivity);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return pipeline statistics', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([
            { status: 'new', count: 10 },
            { status: 'contacted', count: 5 },
            { status: 'qualified', count: 3 },
          ]),
          where: vi.fn().mockResolvedValue([{ count: 8 }]),
        }),
      });

      const result = await service.getStats();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byStatus');
      expect(result).toHaveProperty('thisWeek');
      expect(result).toHaveProperty('needsFollowUp');
    });
  });

  describe('convertLead', () => {
    it('should mark lead as won on conversion', async () => {
      const leadWithActivities = { ...mockLead, status: 'qualified', activities: [] };
      mockFindFirst
        .mockResolvedValueOnce(leadWithActivities) // getLeadById
        .mockResolvedValueOnce(leadWithActivities); // updateLead existing check

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockLead, status: 'won' }]),
          }),
        }),
      });

      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockActivity]),
        }),
      });

      const result = await service.convertLead(mockLead.id, { planId: 'plan-123' }, 'user-123');

      expect(result).toBeDefined();
    });

    it('should throw error when lead not found', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.convertLead('non-existent', { planId: 'plan-123' }, 'user-123')
      ).rejects.toThrow('Lead not found');
    });

    it('should throw error when lead already closed', async () => {
      const closedLead = { ...mockLead, status: 'won', activities: [] };
      mockFindFirst.mockResolvedValueOnce(closedLead);

      await expect(
        service.convertLead(mockLead.id, { planId: 'plan-123' }, 'user-123')
      ).rejects.toThrow('Lead has already been closed');
    });
  });
});
