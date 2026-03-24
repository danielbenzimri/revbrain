/**
 * Customer Mock Data
 *
 * Client-side mock data for the Customers feature.
 * Provides realistic customer entities for development and mock mode.
 */

export interface Customer {
  id: string;
  name: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  projectCount: number;
  activeProjectCount: number;
  createdAt: string;
  logoUrl?: string;
}

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'cust-001',
    name: 'Acme Corporation',
    industry: 'Technology',
    contactName: 'John Smith',
    contactEmail: 'john@acme.com',
    projectCount: 3,
    activeProjectCount: 2,
    createdAt: '2025-11-15T10:30:00.000Z',
  },
  {
    id: 'cust-002',
    name: 'GlobalCorp',
    industry: 'Financial Services',
    contactName: 'Sarah Johnson',
    contactEmail: 'sarah@globalcorp.com',
    projectCount: 1,
    activeProjectCount: 1,
    createdAt: '2026-01-20T14:00:00.000Z',
  },
  {
    id: 'cust-003',
    name: 'Beta Industries',
    industry: 'Manufacturing',
    contactName: 'Mike Chen',
    contactEmail: 'mike@beta-ind.com',
    projectCount: 1,
    activeProjectCount: 0,
    createdAt: '2026-02-10T09:15:00.000Z',
  },
];
