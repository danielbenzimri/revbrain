/**
 * Query Key Factory for Admin Data
 *
 * Centralizes all query keys for consistent cache management.
 * Use these keys with React Query's invalidateQueries for targeted cache updates.
 */
export const adminKeys = {
  all: ['admin'] as const,

  // Users
  users: () => [...adminKeys.all, 'users'] as const,
  usersList: () => [...adminKeys.users(), 'list'] as const,
  userDetail: (id: string) => [...adminKeys.users(), 'detail', id] as const,

  // Tenants (Organizations)
  tenants: () => [...adminKeys.all, 'tenants'] as const,
  tenantsList: () => [...adminKeys.tenants(), 'list'] as const,
  tenantDetail: (id: string) => [...adminKeys.tenants(), 'detail', id] as const,

  // Plans (shared across PricingPlansPage and OnboardTenantDrawer)
  plans: () => [...adminKeys.all, 'plans'] as const,
  plansList: () => [...adminKeys.plans(), 'list'] as const,
  planDetail: (id: string) => [...adminKeys.plans(), 'detail', id] as const,

  // Coupons
  coupons: () => [...adminKeys.all, 'coupons'] as const,
  couponsList: () => [...adminKeys.coupons(), 'list'] as const,
  couponDetail: (id: string) => [...adminKeys.coupons(), 'detail', id] as const,

  // Dashboard Stats
  stats: () => [...adminKeys.all, 'stats'] as const,

  // Audit Logs
  audit: () => [...adminKeys.all, 'audit'] as const,
  auditList: () => [...adminKeys.audit(), 'list'] as const,

  // Support Tickets
  support: () => [...adminKeys.all, 'support'] as const,
  supportTickets: () => [...adminKeys.support(), 'tickets'] as const,
  supportTicketsList: () => [...adminKeys.supportTickets(), 'list'] as const,
  supportTicketDetail: (id: string) => [...adminKeys.supportTickets(), 'detail', id] as const,
  supportStats: () => [...adminKeys.support(), 'stats'] as const,
};
