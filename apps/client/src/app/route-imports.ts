/**
 * Route Lazy Import Map
 *
 * Single source of truth for all lazy import functions. Used by both
 * router.tsx (for lazy() wrappers) and route-prefetch.ts (for chunk preloading).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const routeLazyImports: Record<string, () => Promise<any>> = {
  '/login': () => import('@/features/auth/pages/LoginPage'),
  '/forgot-password': () => import('@/features/auth/pages/ForgotPasswordPage'),
  '/reset-password': () => import('@/features/auth/pages/ResetPasswordPage'),
  '/set-password': () => import('@/features/auth/pages/SetPasswordPage'),
  '/': () => import('@/features/dashboard/pages/DashboardPage'),
  '/projects': () => import('@/features/projects/pages/ProjectsPage'),
  '/billing': () => import('@/features/billing/pages/BillingPage'),
  '/settings': () => import('@/features/settings/pages/SettingsPage'),
  '/settings/profile': () => import('@/features/settings/pages/ProfilePage'),
  '/settings/security': () => import('@/features/settings/pages/SecurityPage'),
  '/settings/account': () => import('@/features/settings/pages/AccountPage'),
  '/help': () => import('@/features/help/pages/HelpPage'),
  '/admin/tenants/onboard': () => import('@/features/admin/pages/OnboardOrganizationPage'),
  '/users/invite': () => import('@/features/org/pages/InviteUserPage'),
  '/users': () => import('@/features/org/pages/TeamPage'),
  '/admin': () => import('@/features/admin/pages/AdminDashboardPage'),
  '/admin/tenants': () => import('@/features/admin/pages/TenantListPage'),
  '/admin/pricing': () => import('@/features/admin/pages/PricingPlansPage'),
  '/admin/support': () => import('@/features/admin/pages/AdminSupportPage'),
  '/admin/users': () => import('@/features/admin/pages/AdminUserListPage'),
  '/admin/coupons': () => import('@/features/admin/pages/CouponListPage'),
  '/project/overview': () => import('@/features/projects/pages/workspace/OverviewPage'),
  '/project/boq': () => import('@/features/projects/pages/workspace/BOQPage'),
  '/project/tasks': () => import('@/features/projects/pages/workspace/TasksPage'),
  '/project/execution': () => import('@/features/projects/pages/workspace/ExecutionPage'),
  '/project/worklogs': () => import('@/features/projects/pages/workspace/WorkLogsPage'),
  '/project/docs': () => import('@/features/projects/pages/workspace/DocsPage'),
  '/project/users': () => import('@/features/projects/pages/workspace/UsersPage'),
  '/project/settings': () => import('@/features/projects/pages/workspace/ProjectSettingsPage'),
};
