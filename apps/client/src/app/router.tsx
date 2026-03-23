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
const TenantDetailPage = lazy(routeLazyImports['/admin/tenants/:id']);
const PricingPlansPage = lazy(routeLazyImports['/admin/pricing']);
const AdminSupportPage = lazy(routeLazyImports['/admin/support']);
const AdminUserListPage = lazy(routeLazyImports['/admin/users']);
const CouponListPage = lazy(routeLazyImports['/admin/coupons']);
const AuditLogPage = lazy(routeLazyImports['/admin/audit']);

// Project Workspace Pages
const OverviewPage = lazy(routeLazyImports['/project/overview']);
const CpqExplorerPage = lazy(routeLazyImports['/project/cpq-explorer']);
const AssessmentPage = lazy(routeLazyImports['/project/assessment']);
const DeploymentPage = lazy(routeLazyImports['/project/deployment']);
const RunsPage = lazy(routeLazyImports['/project/runs']);
const IssuesPage = lazy(routeLazyImports['/project/issues']);
const ProjectTeamPage = lazy(routeLazyImports['/project/team']);
const ActivityPage = lazy(routeLazyImports['/project/activity']);
const ArtifactsPage = lazy(routeLazyImports['/project/artifacts']);
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
              <ProtectedRoute requiredRoles={['org_owner', 'admin']}>
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
            path: 'tenants/:id',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <TenantDetailPage />
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
          {
            path: 'audit',
            element: (
              <Suspense fallback={<PageSkeleton />}>
                <AuditLogPage />
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
        path: 'cpq-explorer',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <CpqExplorerPage />
          </Suspense>
        ),
      },
      {
        path: 'assessment',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <AssessmentPage />
          </Suspense>
        ),
      },
      {
        path: 'deployment',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <DeploymentPage />
          </Suspense>
        ),
      },
      {
        path: 'runs',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <RunsPage />
          </Suspense>
        ),
      },
      {
        path: 'issues',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <IssuesPage />
          </Suspense>
        ),
      },
      {
        path: 'team',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <ProjectTeamPage />
          </Suspense>
        ),
      },
      {
        path: 'activity',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <ActivityPage />
          </Suspense>
        ),
      },
      {
        path: 'artifacts',
        element: (
          <Suspense fallback={<WorkspaceSkeleton />}>
            <ArtifactsPage />
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
