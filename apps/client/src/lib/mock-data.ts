import type { User, UserRole } from '@/types/auth';

// Mock users for local mode - one for each active role
export const MOCK_USERS: Record<UserRole, User> = {
  system_admin: {
    id: '00000000-0000-4000-a000-000000000001',
    name: 'מנהל מערכת',
    email: 'admin@revbrain.io',
    role: 'system_admin',
    avatar: undefined,
  },
  contractor_ceo: {
    id: '00000000-0000-4000-a000-000000000002',
    name: 'דוד לוי',
    email: 'david@contractor.co.il',
    role: 'contractor_ceo',
    group: 'contractor',
  },
  contractor_pm: {
    id: '00000000-0000-4000-a000-000000000003',
    name: 'יוסי כהן',
    email: 'yossi@contractor.co.il',
    role: 'contractor_pm',
    group: 'contractor',
  },
  execution_engineer: {
    id: '00000000-0000-4000-a000-000000000004',
    name: 'משה אברהם',
    email: 'moshe@contractor.co.il',
    role: 'execution_engineer',
    group: 'contractor',
  },
  quantity_surveyor: {
    id: '00000000-0000-4000-a000-000000000005',
    name: 'שרה גולן',
    email: 'sarah@contractor.co.il',
    role: 'quantity_surveyor',
    group: 'contractor',
  },
  quality_controller: {
    id: '00000000-0000-4000-a000-000000000006',
    name: 'רחל מזרחי',
    email: 'rachel@contractor.co.il',
    role: 'quality_controller',
    group: 'contractor',
  },
  client_owner: {
    id: '00000000-0000-4000-a000-000000000007',
    name: 'עמית שרון',
    email: 'amit@client.co.il',
    role: 'client_owner',
    group: 'client',
  },
  client_pm: {
    id: '00000000-0000-4000-a000-000000000008',
    name: 'נועה ברק',
    email: 'noa@client.co.il',
    role: 'client_pm',
    group: 'client',
  },
  inspector: {
    id: '00000000-0000-4000-a000-000000000009',
    name: 'אבי נתן',
    email: 'avi@client.co.il',
    role: 'inspector',
    group: 'client',
  },
  quality_assurance: {
    id: '00000000-0000-4000-a000-000000000010',
    name: 'מיכל דוד',
    email: 'michal@client.co.il',
    role: 'quality_assurance',
    group: 'client',
  },
  accounts_controller: {
    id: '00000000-0000-4000-a000-000000000011',
    name: 'יעל פרץ',
    email: 'yael@client.co.il',
    role: 'accounts_controller',
    group: 'client',
  },
};

// Default mock user for login
export const DEFAULT_MOCK_USER = MOCK_USERS.contractor_pm;
