/**
 * Seed Support Tickets
 *
 * 6 tickets across statuses and priorities, with messages.
 * References MOCK_IDS for users and organizations.
 */
import { MOCK_IDS } from './constants.ts';
import { daysAgo, hoursAgo } from './helpers.ts';

export interface SeedTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  userId: string;
  organizationId: string;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
}

export interface SeedTicketMessage {
  id: string;
  ticketId: string;
  content: string;
  senderType: 'user' | 'admin' | 'system';
  senderName: string;
  isInternal: boolean;
  createdAt: Date;
  attachments: string[];
}

let msgIdCounter = 1;
function msgId(): string {
  return `00000000-0000-4000-a000-0000000006${String(10 + msgIdCounter++).padStart(2, '0')}`;
}

export const SEED_TICKETS: readonly SeedTicket[] = [
  {
    id: MOCK_IDS.TICKET_1,
    ticketNumber: 'TK-001',
    subject: 'Cannot access migration dashboard',
    description:
      'After logging in, the migration dashboard shows a blank page. Browser console shows 403 errors.',
    status: 'open',
    priority: 'high',
    category: 'bug',
    userId: MOCK_IDS.USER_ACME_OPERATOR,
    organizationId: MOCK_IDS.ORG_ACME,
    assignedTo: null,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    id: MOCK_IDS.TICKET_2,
    ticketNumber: 'TK-002',
    subject: 'How to import custom pricing rules?',
    description:
      'We have 500+ custom pricing rules in CPQ. What is the best approach to migrate them to RCA?',
    status: 'in_progress',
    priority: 'medium',
    category: 'question',
    userId: MOCK_IDS.USER_ACME_ADMIN,
    organizationId: MOCK_IDS.ORG_ACME,
    assignedTo: MOCK_IDS.USER_SYSTEM_ADMIN,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    firstResponseAt: daysAgo(2),
    resolvedAt: null,
    closedAt: null,
  },
  {
    id: MOCK_IDS.TICKET_3,
    ticketNumber: 'TK-003',
    subject: 'Request to increase project limit',
    description:
      'We need to run more than 3 concurrent migration projects. Can you upgrade our plan?',
    status: 'waiting_customer',
    priority: 'low',
    category: 'billing',
    userId: MOCK_IDS.USER_BETA_OWNER,
    organizationId: MOCK_IDS.ORG_BETA,
    assignedTo: MOCK_IDS.USER_SYSTEM_ADMIN,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2),
    firstResponseAt: daysAgo(4),
    resolvedAt: null,
    closedAt: null,
  },
  {
    id: MOCK_IDS.TICKET_4,
    ticketNumber: 'TK-004',
    subject: 'Data validation errors after migration',
    description:
      'After running the Q1 migration, 12 records failed validation. Attached the error report.',
    status: 'resolved',
    priority: 'high',
    category: 'bug',
    userId: MOCK_IDS.USER_ACME_OWNER,
    organizationId: MOCK_IDS.ORG_ACME,
    assignedTo: MOCK_IDS.USER_SYSTEM_ADMIN,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(3),
    firstResponseAt: daysAgo(9),
    resolvedAt: daysAgo(3),
    closedAt: null,
  },
  {
    id: MOCK_IDS.TICKET_5,
    ticketNumber: 'TK-005',
    subject: 'Feature request: bulk export',
    description: 'Would be great to export all migration results as a single ZIP file.',
    status: 'closed',
    priority: 'low',
    category: 'feature_request',
    userId: MOCK_IDS.USER_ACME_REVIEWER,
    organizationId: MOCK_IDS.ORG_ACME,
    assignedTo: null,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(25),
    firstResponseAt: daysAgo(29),
    resolvedAt: daysAgo(26),
    closedAt: daysAgo(25),
  },
  {
    id: MOCK_IDS.TICKET_6,
    ticketNumber: 'TK-006',
    subject: 'Urgent: production migration stuck',
    description:
      'Our production migration has been stuck at 60% for 4 hours. This is blocking our go-live.',
    status: 'open',
    priority: 'urgent',
    category: 'bug',
    userId: MOCK_IDS.USER_ACME_OWNER,
    organizationId: MOCK_IDS.ORG_ACME,
    assignedTo: null,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
  },
] as const;

export const SEED_TICKET_MESSAGES: readonly SeedTicketMessage[] = [
  // TK-002 messages (in_progress — has conversation)
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_2,
    content:
      'We have 500+ custom pricing rules in CPQ. What is the best approach to migrate them to RCA?',
    senderType: 'user',
    senderName: 'Sarah Cohen',
    isInternal: false,
    createdAt: daysAgo(3),
    attachments: [],
  },
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_2,
    content:
      'Hi Sarah, great question. For large rule sets, we recommend using the bulk operations module. I will prepare a migration plan for your specific rules.',
    senderType: 'admin',
    senderName: 'System Admin',
    isInternal: false,
    createdAt: daysAgo(2),
    attachments: [],
  },
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_2,
    content: 'Internal note: Check if Acme has the bulk_operations module enabled on their plan.',
    senderType: 'admin',
    senderName: 'System Admin',
    isInternal: true,
    createdAt: daysAgo(2),
    attachments: [],
  },
  // TK-003 messages (waiting_customer)
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_3,
    content: 'We need to run more than 3 concurrent migration projects.',
    senderType: 'user',
    senderName: 'Lisa Park',
    isInternal: false,
    createdAt: daysAgo(5),
    attachments: [],
  },
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_3,
    content:
      'Hi Lisa, you can upgrade to the Pro plan which supports unlimited projects. Would you like me to send you the upgrade link?',
    senderType: 'admin',
    senderName: 'System Admin',
    isInternal: false,
    createdAt: daysAgo(4),
    attachments: [],
  },
  // TK-004 messages (resolved)
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_4,
    content: 'After running the Q1 migration, 12 records failed validation.',
    senderType: 'user',
    senderName: 'David Levy',
    isInternal: false,
    createdAt: daysAgo(10),
    attachments: [],
  },
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_4,
    content:
      'I have identified the issue — the 12 records had duplicate SKUs that conflict with RCA uniqueness constraints. I have fixed the mapping and re-run the validation. All clear now.',
    senderType: 'admin',
    senderName: 'System Admin',
    isInternal: false,
    createdAt: daysAgo(3),
    attachments: [],
  },
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_4,
    content: 'System: Ticket resolved by System Admin.',
    senderType: 'system',
    senderName: 'System',
    isInternal: false,
    createdAt: daysAgo(3),
    attachments: [],
  },
  // TK-001 — new ticket, no messages yet beyond the description
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_1,
    content:
      'After logging in, the migration dashboard shows a blank page. Browser console shows 403 errors.',
    senderType: 'user',
    senderName: 'Mike Johnson',
    isInternal: false,
    createdAt: hoursAgo(2),
    attachments: [],
  },
  // TK-006 — urgent, no response yet
  {
    id: msgId(),
    ticketId: MOCK_IDS.TICKET_6,
    content:
      'Our production migration has been stuck at 60% for 4 hours. This is blocking our go-live. Please help ASAP!',
    senderType: 'user',
    senderName: 'David Levy',
    isInternal: false,
    createdAt: hoursAgo(1),
    attachments: [],
  },
] as const;
