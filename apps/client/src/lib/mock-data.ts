import type { User, UserRole } from '@/types/auth';
import { MOCK_IDS } from './mock-ids';

// Mock users for local mode - one for each role
// IDs must match server mock data (apps/server/src/mocks/constants.ts)
export const MOCK_USERS: Record<UserRole, User> = {
  system_admin: {
    id: MOCK_IDS.USER_SYSTEM_ADMIN,
    name: 'System Admin',
    email: 'admin@revbrain.ai',
    role: 'system_admin',
    avatar: undefined,
  },
  org_owner: {
    id: MOCK_IDS.USER_ACME_OWNER,
    name: 'David Levy (Org Owner)',
    email: 'david@test.org',
    role: 'org_owner',
  },
  admin: {
    id: MOCK_IDS.USER_ACME_ADMIN,
    name: 'Sarah Cohen (Admin)',
    email: 'sarah@test.org',
    role: 'admin',
  },
  operator: {
    id: MOCK_IDS.USER_ACME_OPERATOR,
    name: 'Mike Johnson (Operator)',
    email: 'mike@test.org',
    role: 'operator',
  },
  reviewer: {
    id: MOCK_IDS.USER_ACME_REVIEWER,
    name: 'Amy Chen (Reviewer)',
    email: 'amy@test.org',
    role: 'reviewer',
  },
};

// Default mock user for login
export const DEFAULT_MOCK_USER = MOCK_USERS.org_owner;
