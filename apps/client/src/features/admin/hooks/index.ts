// Query Keys
export { adminKeys } from './query-keys';

// Plans
export { usePlans, useAllPlans, useCreatePlan, useUpdatePlan, useDeletePlan } from './use-plans';

// Tenants
export { useTenants, useUpdateTenant, useDeactivateTenant } from './use-tenants';
export type { Tenant, TenantForEdit } from './use-tenants';

// Users
export {
  useAdminUsers,
  useCreateAdminUser,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from './use-admin-users';
export type { AdminUser } from './use-admin-users';

// Dashboard Stats
export { useAdminStats } from './use-admin-stats';
export type { AdminStats, ActivityEntry } from './use-admin-stats';

// Onboarding
export { useOnboardTenant } from './use-onboard-tenant';

// Coupons
export {
  useCoupons,
  useCouponDetail,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  useSyncCouponToStripe,
} from './use-coupons';
export type { Coupon, CouponUsage, CouponCreateInput, CouponUpdateInput } from './use-coupons';

// Tenant Overrides
export { useTenantOverrides, useGrantOverride, useRevokeOverride } from './use-tenant-overrides';
export type { TenantOverride } from './use-tenant-overrides';

// Audit Logs
export { useAuditLogs } from './use-audit-logs';
export type { AuditLogEntry, AuditLogFilters } from './use-audit-logs';

// Support Tickets
export {
  useTicketStats,
  useSupportTickets,
  useTicketDetail,
  useUpdateTicket,
  useAddTicketMessage,
  useAssignTicket,
} from './use-support-tickets';
export type {
  SupportTicket,
  TicketMessage,
  TicketDetail,
  TicketStats,
  TicketFilters,
  TicketUpdateInput,
  AddMessageInput,
} from './use-support-tickets';
