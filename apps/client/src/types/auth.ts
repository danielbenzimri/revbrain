// Auth types for RevBrain

// User Groups
export type UserGroup = 'contractor' | 'client';

// Contractor Roles
export type ContractorRole =
  | 'contractor_ceo'
  | 'contractor_pm'
  | 'execution_engineer'
  | 'quantity_surveyor'
  | 'quality_controller';

// Client Roles
export type ClientRole =
  | 'client_owner'
  | 'client_pm'
  | 'inspector'
  | 'quality_assurance'
  | 'accounts_controller';

// All User Roles
export type UserRole = 'system_admin' | ContractorRole | ClientRole;

// Role Display Names (Hebrew + English)
export const ROLE_DISPLAY_NAMES: Record<UserRole, { he: string; en: string }> = {
  system_admin: { he: 'מקים המערכת', en: 'System Admin' },
  contractor_ceo: { he: 'מנכ"ל / קבלן ראשי', en: 'CEO / General Contractor' },
  contractor_pm: { he: 'מנהל פרויקט - קבלן', en: 'Project Manager (Contractor)' },
  execution_engineer: { he: 'מהנדס ביצוע', en: 'Execution Engineer' },
  quantity_surveyor: { he: 'כמאי', en: 'Quantity Surveyor' },
  quality_controller: { he: 'בקר איכות', en: 'Quality Controller' },
  client_owner: { he: 'מזמין עבודה', en: 'Project Owner' },
  client_pm: { he: 'מנהל פרויקט - מזמין', en: 'Project Manager (Client)' },
  inspector: { he: 'מפקח', en: 'Inspector' },
  quality_assurance: { he: 'הבטחת איכות', en: 'Quality Assurance' },
  accounts_controller: { he: 'בקר חשבונות', en: 'Accounts Controller' },
};

// Role descriptions for login simulation
export const ROLE_DESCRIPTIONS: Record<UserRole, { he: string; en: string }> = {
  system_admin: { he: 'גישה מלאה למערכת', en: 'Full system access' },
  contractor_ceo: { he: 'ניהול הקבלן וכל הצוות', en: 'Manage contractor & team' },
  contractor_pm: { he: 'ניהול פרויקטים וצוות', en: 'Manage projects & team' },
  execution_engineer: { he: 'ביצוע וחישובי כמויות', en: 'Execution & quantities' },
  quantity_surveyor: { he: 'הכנת חשבונות', en: 'Billing & quantities' },
  quality_controller: { he: 'בקרת איכות', en: 'Quality control' },
  client_owner: { he: 'ניהול הפרויקט', en: 'Project oversight' },
  client_pm: { he: 'ניהול מזמין', en: 'Client project management' },
  inspector: { he: 'פיקוח ואישורים', en: 'Inspection & approvals' },
  quality_assurance: { he: 'הבטחת איכות', en: 'Quality assurance' },
  accounts_controller: { he: 'בקרת חשבונות', en: 'Accounts control' },
};

// Roles that are in development
export const ROLES_IN_DEVELOPMENT: UserRole[] = [
  'quality_controller',
  'quality_assurance',
  'accounts_controller',
];

// User interface
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  group?: UserGroup;
  avatar?: string;
  phone?: string;
}

// Auth state
export type AppMode = 'server' | 'local';

// Get the group for a role
export function getRoleGroup(role: UserRole): UserGroup | null {
  if (
    [
      'contractor_ceo',
      'contractor_pm',
      'execution_engineer',
      'quantity_surveyor',
      'quality_controller',
    ].includes(role)
  ) {
    return 'contractor';
  }
  if (
    ['client_owner', 'client_pm', 'inspector', 'quality_assurance', 'accounts_controller'].includes(
      role
    )
  ) {
    return 'client';
  }
  return null;
}

// Check if we're in development mode
export const isDev = import.meta.env.DEV;
