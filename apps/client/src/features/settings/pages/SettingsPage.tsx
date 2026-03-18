import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { User, Shield, AlertTriangle } from 'lucide-react';

const tabs = [
  { path: '/settings/profile', labelKey: 'settings.tabs.profile', icon: User },
  { path: '/settings/security', labelKey: 'settings.tabs.security', icon: Shield },
  { path: '/settings/account', labelKey: 'settings.tabs.account', icon: AlertTriangle },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();

  // Redirect /settings to /settings/profile
  if (location.pathname === '/settings') {
    return <Navigate to="/settings/profile" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>
        <p className="text-slate-500 mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-violet-500 text-violet-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`
              }
            >
              <tab.icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <Outlet />
    </div>
  );
}
