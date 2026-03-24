/**
 * Project Layout
 *
 * Main layout wrapper for project workspace pages.
 * Uses React Query for project data with prefetch support.
 */
import { useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Header } from '@/components/layout/header';
import { ProjectSidebar } from '../components/ProjectSidebar';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useTranslation } from 'react-i18next';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { useProject } from '../hooks/use-project-api';

export function ProjectLayout() {
  const { id } = useParams<{ id: string }>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isCollapsed } = useSidebarStore();
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  // Fetch project data via React Query (benefits from prefetch on hover)
  const { data: project, isLoading, error } = useProject(id);

  const isWorkspaceView = false;

  // Only show spinner on initial load (no cached/placeholder data yet)
  // This prevents flashing spinner during background refetch
  if (isLoading && !project) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // Error state - only show if no data available
  if (error && !project) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load project</p>
          <p className="text-sm text-slate-500">
            {(error as Error)?.message || 'Project not found'}
          </p>
        </div>
      </div>
    );
  }

  // Guard for TypeScript - project is guaranteed after above checks
  if (!project) {
    return null;
  }

  return (
    <ProjectProvider projectId={project.id} projectName={project.name}>
      <div className="flex h-screen bg-slate-100" dir={isRTL ? 'rtl' : 'ltr'}>
        <ProjectSidebar
          project={project}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Content Area with Header */}
        <div
          className={`flex flex-col flex-1 overflow-hidden transition-all duration-300 ms-0 ${
            isCollapsed ? 'md:ms-16' : 'md:ms-64'
          }`}
        >
          <Header />
          <main
            className={`flex-1 ${
              isWorkspaceView ? 'p-0 overflow-hidden' : 'p-4 md:p-8 overflow-y-auto'
            }`}
          >
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="md:hidden fixed top-4 start-4 z-40 p-2 bg-slate-900 text-white rounded-lg shadow-lg"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
    </ProjectProvider>
  );
}
