/**
 * Project Sidebar
 *
 * Rich workspace sidebar with three navigation groups (Migration, Operations, Project),
 * connection status panel, notification bell, and user info.
 * Supports collapsed state, RTL, locked items with tooltips, and project switching.
 */
import { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import {
  LayoutDashboard,
  Database,
  ClipboardCheck,
  Rocket,
  Play,
  AlertTriangle,
  Users,
  Activity,
  FileArchive,
  Settings,
  Lock,
  Bell,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FolderKanban,
  Search,
  ArrowRightLeft,
  LogOut,
  Circle,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ProjectEntity } from '../hooks/use-project-api';
import { useUser } from '@/stores/auth-store';
import { useShallow } from 'zustand/shallow';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useTranslation } from 'react-i18next';
import { usePrefetchProjectWorkspace } from '@/hooks/use-prefetch';
import { prefetchRoute } from '@/lib/route-prefetch';
import { getMockProjectWorkspaceData, getMockRecentProjects } from '../mocks/workspace-mock-data';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectSidebarProps {
  project: ProjectEntity;
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  path: string;
  locked?: boolean;
  lockHintKey?: string;
  badge?: number;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeRemaining(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return '0m';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}

function getApiUsagePercent(used: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SidebarNavItem = memo(function SidebarNavItem({
  item,
  isActive,
  isCollapsed,
  isRTL,
  onNavigate,
  onPrefetch,
}: {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  isRTL: boolean;
  onNavigate: (path: string) => void;
  onPrefetch: (path: string) => void;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const isLocked = item.locked;

  return (
    <button
      onClick={() => onNavigate(item.path)}
      onMouseEnter={() => onPrefetch(item.path)}
      aria-label={t(item.labelKey)}
      title={
        isCollapsed
          ? isLocked
            ? `${t(item.labelKey)} — ${t(item.lockHintKey || 'workspace.sidebar.locked')}`
            : t(item.labelKey)
          : isLocked
            ? t(item.lockHintKey || 'workspace.sidebar.locked')
            : undefined
      }
      className={cn(
        'w-full flex items-center gap-3 rounded-lg transition-all duration-200',
        isCollapsed ? 'justify-center p-3' : 'px-4 py-2.5',
        isActive
          ? 'bg-violet-600/20 text-violet-400'
          : isLocked
            ? 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-400 cursor-pointer'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      )}
    >
      {isLocked ? (
        <div className="relative">
          <Icon size={isCollapsed ? 22 : 18} strokeWidth={1.5} className="opacity-50" />
          <Lock size={10} className="absolute -bottom-0.5 -end-0.5 text-slate-500" />
        </div>
      ) : (
        <Icon size={isCollapsed ? 22 : 18} strokeWidth={isActive ? 2 : 1.5} />
      )}
      {!isCollapsed && (
        <>
          <span
            className={cn(
              'text-sm font-medium flex-1',
              isRTL ? 'text-right' : 'text-left',
              isLocked && 'text-slate-500'
            )}
          >
            {t(item.labelKey)}
          </span>
          {isLocked && <Lock size={12} className="text-slate-600 shrink-0" />}
          {!isLocked && item.badge !== undefined && item.badge > 0 && (
            <span
              className={cn(
                'min-w-[20px] h-5 flex items-center justify-center text-xs font-bold rounded-full',
                isActive ? 'bg-violet-500 text-white' : 'bg-amber-500/20 text-amber-400'
              )}
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </button>
  );
});

const ProjectSwitcherDropdown = memo(function ProjectSwitcherDropdown({
  currentProjectId,
  isRTL,
  onSelect,
  onClose,
}: {
  currentProjectId: string;
  isRTL: boolean;
  onSelect: (projectId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const projects = getMockRecentProjects();

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className={cn(
        'absolute top-full mt-1 bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden z-50',
        isRTL ? 'end-0' : 'start-0',
        'w-64'
      )}
    >
      <div className="p-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('workspace.sidebar.searchProjects')}
            className="w-full bg-slate-900 text-sm text-white placeholder:text-slate-500 border border-slate-700 rounded-md ps-8 pe-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
            autoFocus
            aria-label={t('workspace.sidebar.searchProjects')}
          />
        </div>
      </div>
      <div className="px-2 pb-1">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
          {t('workspace.sidebar.recentProjects')}
        </p>
      </div>
      <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-0.5">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              p.id === currentProjectId
                ? 'bg-violet-600/20 text-violet-400'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            )}
          >
            <span className="truncate flex-1 text-start">{p.name}</span>
            {p.id === currentProjectId && (
              <Circle size={6} className="fill-violet-400 text-violet-400 shrink-0" />
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-3">{t('common.search')}...</p>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ProjectSidebar({
  project,
  className,
  isOpen = false,
  onClose,
}: ProjectSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const { isCollapsed, toggleSidebar } = useSidebarStore(
    useShallow((s) => ({ isCollapsed: s.isCollapsed, toggleSidebar: s.toggleSidebar }))
  );
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const prefetchWorkspace = usePrefetchProjectWorkspace();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  // Workspace mock data for connection status and issue counts
  const workspaceData = useMemo(() => getMockProjectWorkspaceData(project.id), [project.id]);

  const issueCount = workspaceData.topIssues.length;
  const notificationCount = issueCount;

  // Determine locked states from workspace data
  const hasExtraction = workspaceData.cpqExplorerData !== null;
  const hasAssessment = workspaceData.assessment !== null;
  const hasTarget = workspaceData.targetConnection !== null;

  // Build navigation groups
  const navGroups: NavGroup[] = [
    {
      labelKey: 'workspace.sidebar.migration',
      items: [
        {
          id: 'overview',
          labelKey: 'workspace.sidebar.overview',
          icon: LayoutDashboard,
          path: '',
        },
        {
          id: 'cpq-explorer',
          labelKey: 'workspace.sidebar.cpqExplorer',
          icon: Database,
          path: 'cpq-explorer',
          locked: !hasExtraction,
          lockHintKey: 'workspace.sidebar.unlockHint.cpqExplorer',
        },
        {
          id: 'assessment',
          labelKey: 'workspace.sidebar.assessment',
          icon: ClipboardCheck,
          path: 'assessment',
          locked: !hasExtraction,
          lockHintKey: 'workspace.sidebar.unlockHint.assessment',
        },
        {
          id: 'deployment',
          labelKey: 'workspace.sidebar.deployment',
          icon: Rocket,
          path: 'deployment',
          locked: !hasAssessment || !hasTarget,
          lockHintKey: 'workspace.sidebar.unlockHint.deployment',
        },
      ],
    },
    {
      labelKey: 'workspace.sidebar.operations',
      items: [
        {
          id: 'runs',
          labelKey: 'workspace.sidebar.runs',
          icon: Play,
          path: 'runs',
        },
        {
          id: 'issues',
          labelKey: 'workspace.sidebar.issues',
          icon: AlertTriangle,
          path: 'issues',
          badge: issueCount,
        },
      ],
    },
    {
      labelKey: 'workspace.sidebar.projectSection',
      items: [
        {
          id: 'team',
          labelKey: 'workspace.sidebar.team',
          icon: Users,
          path: 'team',
        },
        {
          id: 'activity',
          labelKey: 'workspace.sidebar.activity',
          icon: Activity,
          path: 'activity',
        },
        {
          id: 'artifacts',
          labelKey: 'workspace.sidebar.artifacts',
          icon: FileArchive,
          path: 'artifacts',
        },
        {
          id: 'settings',
          labelKey: 'workspace.sidebar.settings',
          icon: Settings,
          path: 'settings',
        },
      ],
    },
  ];

  // Current active item from URL
  const pathParts = location.pathname.split('/');
  const projectIdIndex = pathParts.indexOf(project.id);
  const currentPath = projectIdIndex >= 0 ? pathParts.slice(projectIdIndex + 1).join('/') : '';

  // Prefetch on hover
  let hoverTimer: ReturnType<typeof setTimeout>;
  const handleItemPrefetch = useCallback(
    (path: string) => {
      clearTimeout(hoverTimer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      hoverTimer = setTimeout(() => {
        prefetchWorkspace(project.id);
        const routeKey = path ? `/project/${path}` : '/project/overview';
        prefetchRoute(routeKey);
      }, 100);
    },
    [project.id, prefetchWorkspace]
  );

  const handleNavigation = useCallback(
    (path: string) => {
      navigate(`/project/${project.id}/${path}`);
      if (onClose) onClose();
    },
    [navigate, project.id, onClose]
  );

  const handleProjectSwitch = useCallback(
    (projectId: string) => {
      setIsSwitcherOpen(false);
      navigate(`/project/${projectId}`);
    },
    [navigate]
  );

  const getRoleLabel = () => {
    if (!user?.role) return '';
    const roleKey = `roles.${user.role}`;
    const translated = t(roleKey);
    return translated !== roleKey ? translated : user.role;
  };

  const sourceConn = workspaceData.sourceConnection;
  const targetConn = workspaceData.targetConnection;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          isCollapsed ? 'md:w-16 w-64' : 'w-64',
          'bg-gradient-to-b from-[#1e293b] to-[#0f172a] text-white flex flex-col h-screen fixed top-0 shadow-xl z-50 print:hidden overflow-hidden transition-all duration-300 ease-in-out',
          isRTL ? 'end-0' : 'start-0',
          isOpen
            ? 'translate-x-0'
            : isRTL
              ? 'translate-x-full md:translate-x-0'
              : '-translate-x-full md:translate-x-0',
          className
        )}
      >
        {/* Header: Back + Project Name */}
        <div className="p-4 border-b border-slate-800 shrink-0 relative">
          {/* Mobile Close */}
          <button
            onClick={onClose}
            className="md:hidden absolute top-4 start-4 text-slate-400 hover:text-white"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>

          {/* Back to Projects */}
          <button
            onClick={() => navigate('/projects')}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 mb-3 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all',
              isCollapsed && 'justify-center'
            )}
            title={isCollapsed ? t('nav.backToProjects') : undefined}
            aria-label={t('nav.backToProjects')}
          >
            <FolderKanban size={16} />
            {!isCollapsed && <span>{t('nav.backToProjects')}</span>}
          </button>

          {/* Logo + Project Name + Collapse */}
          <div className={cn('flex items-center gap-3', isCollapsed && 'justify-center')}>
            <div
              className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-lg flex items-center justify-center font-bold text-lg overflow-hidden shadow-lg shrink-0"
              title={isCollapsed ? `REVBRAIN - ${project.name}` : undefined}
            >
              <ArrowRightLeft size={20} className="text-white" />
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0 relative">
                  <span className="font-black text-xl tracking-tight block leading-none">
                    REVBRAIN
                  </span>
                  <button
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className="flex items-center gap-1 text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors max-w-[140px]"
                    aria-label={t('workspace.sidebar.projectSwitcher')}
                  >
                    <span className="truncate">{project.name}</span>
                    <ChevronDown
                      size={10}
                      className={cn(
                        'shrink-0 transition-transform',
                        isSwitcherOpen && 'rotate-180'
                      )}
                    />
                  </button>
                  {isSwitcherOpen && (
                    <ProjectSwitcherDropdown
                      currentProjectId={project.id}
                      isRTL={isRTL}
                      onSelect={handleProjectSwitch}
                      onClose={() => setIsSwitcherOpen(false)}
                    />
                  )}
                </div>
                <button
                  onClick={toggleSidebar}
                  className="hidden md:flex items-center justify-center p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all shrink-0"
                  title={t('workspace.sidebar.collapse')}
                  aria-label={t('workspace.sidebar.collapse')}
                >
                  {isRTL ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </button>
              </>
            )}
            {isCollapsed && (
              <button
                onClick={toggleSidebar}
                className={cn(
                  'hidden md:flex absolute top-3 items-center justify-center w-10 h-10 bg-slate-700 text-white hover:bg-violet-600 rounded-lg transition-all shadow-lg',
                  isRTL ? 'end-3' : 'start-3'
                )}
                title={t('workspace.sidebar.expand')}
                aria-label={t('workspace.sidebar.expand')}
              >
                {isRTL ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Groups */}
        <nav
          className={cn('flex-1 overflow-y-auto min-h-0', isCollapsed ? 'py-4 px-2' : 'py-4 px-3')}
        >
          {navGroups.map((group, gi) => (
            <div key={group.labelKey} className={gi > 0 ? 'mt-6' : ''}>
              {!isCollapsed && (
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 mb-2">
                  {t(group.labelKey)}
                </p>
              )}
              {isCollapsed && gi > 0 && <div className="mx-2 mb-3 border-t border-slate-800" />}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    item={item}
                    isActive={currentPath === item.path || (item.path === '' && currentPath === '')}
                    isCollapsed={isCollapsed}
                    isRTL={isRTL}
                    onNavigate={handleNavigation}
                    onPrefetch={handleItemPrefetch}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Section: Connection Status + Notifications + User */}
        <div className="border-t border-slate-800 bg-slate-900/80 shrink-0">
          {/* Connection Status */}
          {!isCollapsed && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {t('workspace.sidebar.connectionStatus')}
              </p>
              {/* Source */}
              <div className="flex items-center gap-2 text-xs">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    sourceConn
                      ? sourceConn.health === 'healthy'
                        ? 'bg-emerald-400'
                        : sourceConn.health === 'degraded'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                      : 'bg-slate-600'
                  )}
                />
                <span className="text-slate-400 truncate flex-1">
                  {sourceConn ? sourceConn.orgName.split('.')[0] : t('workspace.sidebar.sourceOrg')}
                </span>
              </div>
              {/* Target */}
              <div className="flex items-center gap-2 text-xs">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    targetConn
                      ? targetConn.health === 'healthy'
                        ? 'bg-emerald-400'
                        : targetConn.health === 'degraded'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                      : 'bg-slate-600'
                  )}
                />
                <span className="text-slate-400 truncate flex-1">
                  {targetConn ? targetConn.orgName.split('.')[0] : t('workspace.sidebar.targetOrg')}
                </span>
              </div>
              {/* API Budget */}
              {sourceConn && (
                <div className="pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>{t('workspace.sidebar.apiBudget')}</span>
                    <span>
                      {t('workspace.sidebar.apiResets', {
                        time: formatTimeRemaining(sourceConn.apiResetTime),
                      })}
                    </span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        getApiUsagePercent(sourceConn.apiCallsUsed, sourceConn.apiCallsLimit) > 80
                          ? 'bg-amber-400'
                          : 'bg-violet-500'
                      )}
                      style={{
                        width: `${getApiUsagePercent(sourceConn.apiCallsUsed, sourceConn.apiCallsLimit)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notification bell + User row */}
          <div className={cn('px-4 py-3 border-t border-slate-800', isCollapsed && 'px-2')}>
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-3">
                {/* Notification */}
                <button
                  className="relative text-slate-400 hover:text-white transition p-1"
                  aria-label={t('workspace.sidebar.notifications')}
                  title={t('workspace.sidebar.notifications')}
                >
                  <Bell size={18} />
                  {notificationCount > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 min-w-[14px] h-3.5 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5">
                      {notificationCount}
                    </span>
                  )}
                </button>
                {/* User avatar */}
                <div
                  className="w-8 h-8 rounded-full border-2 border-slate-700 bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-medium"
                  title={user?.name ? `${user.name} - ${getRoleLabel()}` : t('common.pendingSetup')}
                >
                  {user?.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <button
                  onClick={() => navigate('/projects')}
                  className="text-slate-400 hover:text-white transition"
                  title={t('nav.backToMain')}
                  aria-label={t('nav.backToMain')}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {/* Notification bell */}
                <button
                  className="relative text-slate-400 hover:text-white transition p-1 shrink-0"
                  aria-label={t('workspace.sidebar.notifications')}
                >
                  <Bell size={18} />
                  {notificationCount > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 min-w-[14px] h-3.5 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5">
                      {notificationCount}
                    </span>
                  )}
                </button>
                {/* User info */}
                <div className="flex-1 min-w-0">
                  {user?.name ? (
                    <>
                      <div className="text-sm font-medium text-white truncate">{user.name}</div>
                      <div className="text-[10px] text-slate-500">{getRoleLabel()}</div>
                    </>
                  ) : (
                    <div className="text-sm text-amber-400 truncate">
                      {t('common.pendingSetup')}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate('/projects')}
                  className="text-slate-400 hover:text-white transition p-1 shrink-0"
                  title={t('nav.backToMain')}
                  aria-label={t('nav.backToMain')}
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
