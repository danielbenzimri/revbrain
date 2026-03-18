// Auth types for RevBrain

// All User Roles
export type UserRole = 'system_admin' | 'org_owner' | 'admin' | 'operator' | 'reviewer';

// Role Display Names (Hebrew + English)
export const ROLE_DISPLAY_NAMES: Record<UserRole, { he: string; en: string }> = {
  system_admin: { he: 'מנהל מערכת', en: 'System Admin' },
  org_owner: { he: 'בעל הארגון', en: 'Organization Owner' },
  admin: { he: 'מנהל', en: 'Admin' },
  operator: { he: 'מפעיל', en: 'Operator' },
  reviewer: { he: 'סוקר', en: 'Reviewer' },
};

// Role descriptions
export const ROLE_DESCRIPTIONS: Record<UserRole, { he: string; en: string }> = {
  system_admin: { he: 'גישה מלאה למערכת', en: 'Full system access' },
  org_owner: { he: 'בעלות על הארגון, חיוב וגישה מלאה', en: 'Org ownership, billing & full access' },
  admin: { he: 'גישה מלאה לכל הפרויקטים', en: 'Full access to all projects' },
  operator: { he: 'עבודת מיגרציה בפרויקטים מוקצים', en: 'Migration work on assigned projects' },
  reviewer: {
    he: 'צפייה בלבד + הערות בפרויקטים מוקצים',
    en: 'View-only + remarks on assigned projects',
  },
};

// User interface
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
}

// Auth state
export type AppMode = 'server' | 'local';

// Check if we're in development mode
export const isDev = import.meta.env.DEV;
