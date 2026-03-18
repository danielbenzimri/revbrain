/**
 * Project Sidebar
 *
 * EXACT copy of legacy app Sidebar component
 * Navigation sidebar for project workspace - matches legacy pixel-by-pixel
 */
import {
  LayoutDashboard,
  FileText,
  Settings,
  ArrowRightLeft,
  X,
  ArrowRight,
  FolderKanban,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ProjectEntity } from '../hooks/use-project-api';
import { useUser } from '@/stores/auth-store';
import { useShallow } from 'zustand/shallow';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useTranslation } from 'react-i18next';
import { usePrefetchProjectWorkspace } from '@/hooks/use-prefetch';
import { prefetchRoute } from '@/lib/route-prefetch';

interface ProjectSidebarProps {
  project: ProjectEntity;
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

type MainView = 'dashboard' | 'docs' | 'users' | 'settings';

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

  // Prefetch project data and route chunks on menu hover
  let hoverTimer: ReturnType<typeof setTimeout>;
  const handleItemPrefetch = (path: string) => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      prefetchWorkspace(project.id);
      const routeKey = path ? `/project/${path}` : '/project/overview';
      prefetchRoute(routeKey);
    }, 100);
  };

  // Time tracker removed for MVP scope - was too intrusive

  // Map routes to view IDs
  const pathToView: Record<string, MainView> = {
    '': 'dashboard',
    docs: 'docs',
    users: 'users',
    settings: 'settings',
  };

  // Get current view from URL
  const pathParts = location.pathname.split('/');
  const lastPart = pathParts[pathParts.length - 1];
  const currentView = pathToView[lastPart] || 'dashboard';

  // Menu items with translation keys - MVP scope (8 items)
  const menuItems = [
    {
      id: 'dashboard',
      labelKey: 'projects.tabs.overview',
      icon: LayoutDashboard,
      path: '',
      badge: 0,
    },
    { id: 'docs', labelKey: 'projects.tabs.docs', icon: FileText, path: 'docs', badge: 0 },
    {
      id: 'users',
      labelKey: 'projects.tabs.users',
      icon: Users,
      path: 'users',
      badge: 0,
    },
    {
      id: 'settings',
      labelKey: 'projects.tabs.settings',
      icon: Settings,
      path: 'settings',
      badge: 0,
    },
  ];

  const getRoleLabel = () => {
    if (!user?.role) return '';
    const roleKey = `roles.${user.role}`;
    const translated = t(roleKey);
    // If translation key doesn't exist, return the role as-is
    return translated !== roleKey ? translated : user.role;
  };

  const handleNavigation = (path: string) => {
    navigate(`/project/${project.id}/${path}`);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        className={`
        ${isCollapsed ? 'md:w-16 w-64' : 'w-64'} bg-gradient-to-b from-[#1e293b] to-[#0f172a] text-white flex flex-col h-screen fixed ${isRTL ? 'right-0' : 'left-0'} top-0 shadow-xl z-50 print:hidden overflow-hidden
        transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : `${isRTL ? 'translate-x-full' : '-translate-x-full'} md:translate-x-0`}
        ${className || ''}
      `}
      >
        <div className="p-4 border-b border-slate-800 shrink-0 relative">
          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="md:hidden absolute top-4 left-4 text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>

          {/* Back to Projects Button */}
          <button
            onClick={() => navigate('/projects')}
            className={`w-full flex items-center gap-2 px-3 py-2 mb-3 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all ${isCollapsed && 'justify-center'}`}
            title={isCollapsed ? t('nav.backToProjects') : undefined}
          >
            {isCollapsed ? (
              <FolderKanban size={16} />
            ) : (
              <>
                {isRTL && <ArrowRight size={16} />}
                {!isRTL && <FolderKanban size={16} />}
                <FolderKanban size={16} className={isRTL ? '' : 'hidden'} />
                <span>{t('nav.backToProjects')}</span>
                {!isRTL && <ArrowRight size={16} className="rotate-180" />}
              </>
            )}
          </button>

          {/* LOGO SECTION with Toggle */}
          <div className={`flex items-center gap-3 ${isCollapsed && 'justify-center'}`}>
            <div
              className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-lg flex items-center justify-center font-bold text-lg overflow-hidden shadow-lg shrink-0"
              title={isCollapsed ? `REVBRAIN - ${project.name}` : undefined}
            >
              <ArrowRightLeft size={20} className="text-white" />
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1">
                  <span className="font-black text-xl tracking-tight block leading-none">
                    REVBRAIN
                  </span>
                  <span className="text-[10px] font-bold truncate block max-w-[140px] text-violet-400">
                    {project.name}
                  </span>
                </div>
                {/* Toggle Button - Inside sidebar */}
                <button
                  onClick={toggleSidebar}
                  className="hidden md:flex items-center justify-center p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all shrink-0"
                  title={t('nav.collapse')}
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
                className={`hidden md:flex absolute top-3 ${isRTL ? 'right-3' : 'left-3'} items-center justify-center w-10 h-10 bg-slate-700 text-white hover:bg-violet-600 rounded-lg transition-all shadow-lg`}
                title={t('nav.expand')}
              >
                {isRTL ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>

        <nav
          className={`flex-1 ${isCollapsed ? 'py-4 px-2' : 'py-6 px-3'} space-y-1 overflow-y-auto min-h-0`}
        >
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.path)}
                onMouseEnter={() => handleItemPrefetch(item.path)}
                onFocus={() => {
                  prefetchWorkspace(project.id);
                  prefetchRoute(item.path ? `/project/${item.path}` : '/project/overview');
                }}
                className={`w-full flex items-center gap-3 rounded-lg transition-all duration-200 ${
                  isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
                } ${
                  isActive
                    ? 'bg-violet-600 text-white shadow-lg'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title={isCollapsed ? t(item.labelKey) : undefined}
              >
                <Icon size={isCollapsed ? 24 : 20} strokeWidth={isCollapsed ? 1.5 : 2} />
                {!isCollapsed && (
                  <>
                    <span className={`font-medium flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {t(item.labelKey)}
                    </span>
                    {item.badge > 0 && (
                      <span
                        className={`min-w-[20px] h-5 flex items-center justify-center text-xs font-bold rounded-full ${
                          isActive ? 'bg-white text-violet-600' : 'bg-red-500 text-white'
                        }`}
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-10 h-10 rounded-full border-2 border-slate-700 bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-medium"
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
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full border-2 border-slate-700 bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-medium">
                  {user?.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="overflow-hidden">
                  {user?.name ? (
                    <>
                      <div className="font-bold text-sm truncate">{user.name}</div>
                      <div className="text-xs text-slate-400">{getRoleLabel()}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-sm text-amber-400 truncate">
                        {t('common.pendingSetup')}
                      </div>
                      <div className="text-xs text-slate-500">{getRoleLabel()}</div>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => navigate('/projects')}
                className="flex items-center gap-3 text-slate-400 hover:text-white transition px-4 py-2 w-full"
              >
                <LogOut size={18} />
                <span>{t('nav.backToMain')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
