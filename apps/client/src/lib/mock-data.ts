import type { User, UserRole } from '@/types/auth';

// Mock users for local mode - one for each role
export const MOCK_USERS: Record<UserRole, User> = {
  system_admin: {
    id: '00000000-0000-4000-a000-000000000001',
    name: 'System Admin',
    email: 'admin@revbrain.io',
    role: 'system_admin',
    avatar: undefined,
  },
  org_owner: {
    id: '00000000-0000-4000-a000-000000000002',
    name: 'David Levy',
    email: 'david@acme.com',
    role: 'org_owner',
  },
  admin: {
    id: '00000000-0000-4000-a000-000000000003',
    name: 'Sarah Cohen',
    email: 'sarah@acme.com',
    role: 'admin',
  },
  operator: {
    id: '00000000-0000-4000-a000-000000000004',
    name: 'Mike Johnson',
    email: 'mike@acme.com',
    role: 'operator',
  },
  reviewer: {
    id: '00000000-0000-4000-a000-000000000005',
    name: 'Amy Chen',
    email: 'amy@client.com',
    role: 'reviewer',
  },
};

// Default mock user for login
export const DEFAULT_MOCK_USER = MOCK_USERS.operator;
