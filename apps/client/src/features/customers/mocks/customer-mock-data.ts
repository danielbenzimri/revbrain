/**
 * Customer Mock Data
 *
 * Client-side mock data for the Customers feature.
 * Provides realistic customer entities for development and mock mode.
 */

export interface CustomerContact {
  name: string;
  email: string;
  phone?: string;
  role: string;
}

export interface CustomerProject {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'on_hold' | 'cancelled';
  stage: string;
  stageColor: string;
  updatedAt: string;
}

export interface SalesforceOrgInfo {
  orgName: string;
  instanceType: 'Production' | 'Sandbox';
  cpqEdition?: string;
  licenseCount?: number;
  connected: boolean;
}

export interface CustomerBranding {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
}

export interface Customer {
  id: string;
  name: string;
  industry: string;
  website?: string;
  companySize: 'startup' | 'smb' | 'mid-market' | 'enterprise';
  branding: CustomerBranding;
  primaryContact: CustomerContact;
  additionalContacts?: CustomerContact[];
  salesforceOrgs: SalesforceOrgInfo[];
  projects: CustomerProject[];
  projectCount: number;
  activeProjectCount: number;
  notes?: string;
  totalObjectsMigrated: number;
  totalRecordsMigrated: number;
  createdAt: string;
  lastActivityAt: string;
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'cust-001',
    name: 'Acme Corporation',
    industry: 'Technology',
    website: 'https://acme.com',
    companySize: 'enterprise',
    branding: {
      primaryColor: '#1a56db',
      secondaryColor: '#f0f5ff',
      accentColor: '#e02424',
    },
    primaryContact: {
      name: 'John Smith',
      email: 'john.smith@acme.com',
      phone: '+1 (415) 555-0123',
      role: 'VP Revenue Operations',
    },
    additionalContacts: [
      {
        name: 'Lisa Wang',
        email: 'lisa.wang@acme.com',
        role: 'Salesforce Admin',
      },
      {
        name: 'Tom Davis',
        email: 'tom.davis@acme.com',
        role: 'CPQ Administrator',
      },
    ],
    salesforceOrgs: [
      {
        orgName: 'acme.my.salesforce.com',
        instanceType: 'Production',
        cpqEdition: 'CPQ Plus',
        licenseCount: 450,
        connected: true,
      },
      {
        orgName: 'acme--uat.sandbox.my.salesforce.com',
        instanceType: 'Sandbox',
        connected: false,
      },
    ],
    projects: [
      {
        id: '00000000-0000-4000-a000-000000000401',
        name: 'Q1 Enterprise Product Catalog Migration',
        status: 'active',
        stage: 'assessed',
        stageColor: 'amber',
        updatedAt: hoursAgo(4),
      },
      {
        id: '00000000-0000-4000-a000-000000000402',
        name: 'Legacy Pricing Cleanup',
        status: 'active',
        stage: 'connected',
        stageColor: 'emerald',
        updatedAt: daysAgo(1),
      },
      {
        id: '00000000-0000-4000-a000-000000000403',
        name: 'RCA Pilot',
        status: 'completed',
        stage: 'complete',
        stageColor: 'emerald',
        updatedAt: daysAgo(7),
      },
    ],
    projectCount: 3,
    activeProjectCount: 2,
    totalObjectsMigrated: 42,
    totalRecordsMigrated: 12847,
    notes:
      'Enterprise client, high priority. Prefers sandbox-first approach for all deployments. Budget approved through Q2. VP RevOps is the primary decision maker — include in all status updates.',
    createdAt: '2025-11-15T10:30:00.000Z',
    lastActivityAt: hoursAgo(4),
  },
  {
    id: 'cust-002',
    name: 'GlobalCorp',
    industry: 'Financial Services',
    website: 'https://globalcorp.com',
    companySize: 'enterprise',
    branding: {
      primaryColor: '#047857',
      secondaryColor: '#ecfdf5',
    },
    primaryContact: {
      name: 'Sarah Johnson',
      email: 'sarah.johnson@globalcorp.com',
      phone: '+1 (212) 555-0456',
      role: 'Director of Sales Systems',
    },
    salesforceOrgs: [
      {
        orgName: 'globalcorp.my.salesforce.com',
        instanceType: 'Production',
        cpqEdition: 'CPQ Plus',
        licenseCount: 1200,
        connected: false,
      },
    ],
    projects: [
      {
        id: '00000000-0000-4000-a000-000000000404',
        name: 'Phase 2 Migration',
        status: 'active',
        stage: 'setup',
        stageColor: 'slate',
        updatedAt: daysAgo(2),
      },
    ],
    projectCount: 1,
    activeProjectCount: 1,
    totalObjectsMigrated: 0,
    totalRecordsMigrated: 0,
    notes:
      'Referred by Salesforce AE. Very security-conscious — all data handling questions go through their InfoSec team.',
    createdAt: '2026-01-20T14:00:00.000Z',
    lastActivityAt: daysAgo(2),
  },
  {
    id: 'cust-003',
    name: 'Beta Industries',
    industry: 'Manufacturing',
    website: 'https://beta-ind.com',
    companySize: 'mid-market',
    branding: {
      primaryColor: '#7c3aed',
    },
    primaryContact: {
      name: 'Mike Chen',
      email: 'mike.chen@beta-ind.com',
      phone: '+1 (408) 555-0789',
      role: 'IT Manager',
    },
    salesforceOrgs: [
      {
        orgName: 'beta-corp.my.salesforce.com',
        instanceType: 'Production',
        cpqEdition: 'CPQ Standard',
        licenseCount: 85,
        connected: true,
      },
    ],
    projects: [
      {
        id: '00000000-0000-4000-a000-000000000402',
        name: 'Legacy Pricing Cleanup',
        status: 'active',
        stage: 'connected',
        stageColor: 'emerald',
        updatedAt: daysAgo(1),
      },
    ],
    projectCount: 1,
    activeProjectCount: 0,
    totalObjectsMigrated: 0,
    totalRecordsMigrated: 0,
    createdAt: '2026-02-10T09:15:00.000Z',
    lastActivityAt: daysAgo(5),
  },
];

export function getCustomerById(id: string): Customer | undefined {
  return MOCK_CUSTOMERS.find((c) => c.id === id);
}
