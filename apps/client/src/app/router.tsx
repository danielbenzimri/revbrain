import { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import MainLayout from '@/components/layout/main-layout';
import { ProjectLayout } from '@/features/projects/layouts/project-layout';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import {
  PageSkeleton,
  DashboardSkeleton,
  ProjectsSkeleton,
  BillingSkeleton,
  TeamSkeleton,
  WorkspaceSkeleton,
} from '@/components/ui/skeleton';

import { routeLazyImports } from './route-imports';

// Lazy Load Pages
const LoginPage = lazy(routeLazyImports['/login']);
const ForgotPasswordPage = lazy(routeLazyImports['/forgot-password']);
const ResetPasswordPage = lazy(routeLazyImports['/reset-password']);
const SetPasswordPage = lazy(routeLazyImports['/set-password']);
const DashboardPage = lazy(routeLazyImports['/']);
const ProjectsPage = lazy(routeLazyImports['/projects']);
const BillingPage = lazy(routeLazyImports['/billing']);
const SettingsPage = lazy(routeLazyImports['/settings']);
const ProfilePage = lazy(routeLazyImports['/settings/profile']);
const SecurityPage = lazy(routeLazyImports['/settings/security']);
const AccountPage = lazy(routeLazyImports['/settings/account']);
const HelpPage = lazy(routeLazyImports['/help']);
const OnboardOrganizationPage = lazy(routeLazyImports['/admin/tenants/onboard']);
const InviteUserPage = lazy(routeLazyImports['/users/invite']);
const TeamPage = lazy(routeLazyImports['/users']);
const AdminDashboardPage = lazy(routeLazyImports['/admin']);
const TenantListPage = lazy(routeLazyImports['/admin/tenants']);
const PricingPlansPage = lazy(routeLazyImports['/admin/pricing']);
const AdminSupportPage = lazy(routeLazyImports['/admin/support']);
const AdminUserListPage = lazy(routeLazyImports['/admin/users']);
const CouponListPage = lazy(routeLazyImports['/admin/coupons']);

// Project Workspace Pages
const OverviewPage = lazy(routeLazyImports['/project/overview']);
const BOQPage = lazy(routeLazyImports['/project/boq']);
const TasksPage = lazy(routeLazyImports['/project/tasks']);
const ExecutionPage = lazy(routeLazyImports['/project/execution']);
const WorkLogsPage = lazy(routeLazyImports['/project/worklogs']);
const DocsPage = lazy(routeLazyImports['/project/docs']);
const UsersPage = lazy(routeLazyImports['/project/users']);
const ProjectSettingsPage = lazy(routeLazyImports['/project/settings']);

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense
        fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
      >
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <Suspense
        fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
      >
        <ForgotPasswordPage />
      </Suspense>
    ),
  },
  {
    path: '/reset-password',
    element: (
      <Suspense
        fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
      >
        <ResetPasswordPage />
      </Suspense>
    ),
  },
  {
    path: '/set-password',
    element: (
      <Suspense
        fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
      >
        <SetPasswordPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'projects',
        element: (
          <Suspense fallback={<ProjectsSkeleton />}>
            <ProjectsPage />
          </Suspense>
        ),
      },
      {
        path: 'billing',
        element: (
          <Suspense fallback={<BillingSkeleton />}>
            <BillingPage />
          </Suspense>
        ),
      },
      {
        path: 'users',
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<TeamSkeleton />}>
                <TeamPage />
              </Suspense>
            ),
          },
          {
            path: 'invite',
            element: (
              <ProtectedRoute requiredRoles={['contractor_ceo', 'client_owner']}>
                <Suspense fallback={<PageSkeleton />}>
                  <InviteUserPage />
                </Suspense>
              </ProtectedRoute>
            ),
          },
        ],
      },
      {
        path: 'admin',
        element: (
          <ProtectedRoute requiredRoles={['system_admin']}>
            <Outlet />
          </ProtectedRoute>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<DashboardSkeleton />}>
                <AdminDashboardPage />
              </Suspense>
            ),
          },
          {
            path: 'tenants',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <TenantListPage />
              </Suspense>
            ),
          },
          {
            path: 'tenants/onboard',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <OnboardOrganizationPage />
              </Suspense>
            ),
          },
          {
            path: 'users',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <AdminUserListPage />
              </Suspense>
            ),
          },
          {
            path: 'users/invite',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <InviteUserPage />
              </Suspense>
            ),
          },
          {
            path: 'pricing',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <PricingPlansPage />
              </Suspense>
            ),
          },
          {
            path: 'coupons',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <CouponListPage />
              </Suspense>
            ),
          },
          {
            path: 'support',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <AdminSupportPage />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <SettingsPage />
          </Suspense>
        ),
        children: [
          {
            path: 'profile',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <ProfilePage />
              </Suspense>
            ),
          },
          {
            path: 'security',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <SecurityPage />
              </Suspense>
            ),
          },
          {
            path: 'account',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <AccountPage />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'help',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <HelpPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/project/:id',
    element: (
      <ProtectedRoute>
        <ProjectLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <OverviewPage />
          </Suspense>
        ),
      },
      {
        path: 'boq',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <BOQPage />
          </Suspense>
        ),
      },
      {
        path: 'tasks',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <TasksPage />
          </Suspense>
        ),
      },
      {
        path: 'execution',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <ExecutionPage />
          </Suspense>
        ),
      },
      {
        path: 'worklogs',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <WorkLogsPage />
          </Suspense>
        ),
      },
      {
        path: 'docs',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <DocsPage />
          </Suspense>
        ),
      },
      {
        path: 'users',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <UsersPage />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <ProjectSettingsPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
