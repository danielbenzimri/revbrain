import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ArrowRightLeft,
  FolderKanban,
  FileText,
  Settings,
  LogOut,
  HelpCircle,
  Building2,
  Users,
  CreditCard,
  LifeBuoy,
  ScrollText,
  Tag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useUser } from '@/stores/auth-store';
import { useImpersonationStore } from '@/stores/impersonation-store';
import { ROLE_DISPLAY_NAMES } from '@/types/auth';
import { useShallow } from 'zustand/shallow';
import { useSidebarStore } from '@/stores/sidebar-store';
import { prefetchRoute, prefetchRouteData } from '@/lib/route-prefetch';
import { useQueryClient } from '@tanstack/react-query';

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

export function Sidebar({ className }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const { isCollapsed, toggleSidebar } = useSidebarStore(
    useShallow((s) => ({ isCollapsed: s.isCollapsed, toggleSidebar: s.toggleSidebar }))
  );

  const isHebrew = i18n.language === 'he';

  const isSystemAdmin = user?.role === 'system_admin';
  const isImpersonating = useImpersonationStore((s) => s.isImpersonating);

  const mainItems = [
    { nameKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
    { nameKey: 'nav.projects', href: '/projects', icon: FolderKanban },
    { nameKey: 'nav.billing', href: '/billing', icon: FileText },
    { nameKey: 'nav.settings', href: '/settings', icon: Settings },
    { nameKey: 'nav.help', href: '/help', icon: HelpCircle },
  ];

  const adminItems = [
    { nameKey: 'nav.admin.dashboard', href: '/admin', icon: LayoutDashboard }, // Distinct admin dashboard
    { nameKey: 'nav.admin.tenants', href: '/admin/tenants', icon: Building2 }, // Manage Tenants
    { nameKey: 'nav.admin.users', href: '/admin/users', icon: Users }, // Global User Management
    { nameKey: 'nav.admin.pricing', href: '/admin/pricing', icon: CreditCard }, // Pricing Plans
    { nameKey: 'nav.admin.coupons', href: '/admin/coupons', icon: Tag }, // Coupons & Promotions
    { nameKey: 'nav.admin.support', href: '/admin/support', icon: LifeBuoy }, // Support
    { nameKey: 'nav.admin.audit', href: '/admin/audit', icon: ScrollText }, // Audit Log
    { nameKey: 'nav.settings', href: '/settings', icon: Settings },
  ];

  // During impersonation, show org navigation instead of admin items
  const items = isImpersonating ? mainItems : isSystemAdmin ? adminItems : mainItems;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Debounced hover prefetch to prevent prefetch storms
  let hoverTimer: ReturnType<typeof setTimeout>;
  const handleHoverPrefetch = (href: string) => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      prefetchRoute(href);
      prefetchRouteData(href, queryClient);
    }, 100);
  };

  // Get user display info
  const userDisplayName = user?.name || 'User';
  const userEmail = user?.email || 'user@example.com';
  const userRole = user?.role ? ROLE_DISPLAY_NAMES[user.role]?.[isHebrew ? 'he' : 'en'] : '';
  const userInitials = userDisplayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <div
      className={cn(
        'bg-gradient-to-b from-slate-800 to-slate-900 text-white h-full overflow-y-auto flex flex-col relative transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Logo & Toggle */}
      <div
        className={cn(
          'p-4 flex items-center gap-3 border-b border-slate-700',
          isCollapsed && 'justify-center'
        )}
      >
        <div className="h-10 w-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
          <ArrowRightLeft size={20} />
        </div>
        {!isCollapsed && (
          <>
            <div className="flex-1">
              <h2 className="text-lg font-bold tracking-tight">REVBRAIN</h2>
              <p className="text-xs text-slate-400">{t('common.systemSubtitle')}</p>
            </div>
            {/* Toggle Button - Inside sidebar */}
            <button
              onClick={toggleSidebar}
              className="hidden md:flex items-center justify-center p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
              title={t('nav.collapse')}
            >
              {isHebrew ? (
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
            className="hidden md:flex absolute top-2 left-1 items-center justify-center p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
            title={t('nav.expand')}
          >
            {isHebrew ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              onMouseEnter={() => handleHoverPrefetch(item.href)}
              onFocus={() => prefetchRoute(item.href)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                  : 'text-slate-300 hover:bg-slate-700/50 hover:text-white',
                isCollapsed && 'justify-center'
              )}
              title={isCollapsed ? t(item.nameKey) : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && t(item.nameKey)}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-3 border-t border-slate-700">
        <div
          className={cn(
            'flex items-center gap-3 p-2 rounded-lg bg-slate-700/30',
            isCollapsed && 'flex-col gap-2'
          )}
        >
          <div className="h-9 w-9 bg-violet-500 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
            {userInitials}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{userDisplayName}</p>
                <p className="text-xs text-slate-400 truncate">{userRole || userEmail}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-red-400 transition-colors"
                title={t('nav.logout')}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
          {isCollapsed && (
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 transition-colors"
              title={t('nav.logout')}
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
