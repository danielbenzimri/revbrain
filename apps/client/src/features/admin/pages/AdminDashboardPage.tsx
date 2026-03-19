import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Users, Building2, CreditCard, TrendingUp, Plus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardTenantDrawer } from '../components/OnboardTenantDrawer';

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [showOnboardDrawer, setShowOnboardDrawer] = useState(false);

  // Mock Stats
  const stats = [
    {
      labelKey: 'admin.dashboard.stats.totalTenants',
      value: '42',
      change: '+12%',
      icon: Building2,
      color: 'text-violet-500 bg-violet-50',
    },
    {
      labelKey: 'admin.dashboard.stats.activeUsers',
      value: '1,234',
      change: '+5%',
      icon: Users,
      color: 'text-violet-500 bg-violet-50',
    },
    {
      labelKey: 'admin.dashboard.stats.mrr',
      value: '$42.5k',
      change: '+8%',
      icon: CreditCard,
      color: 'text-purple-500 bg-purple-50',
    },
    {
      labelKey: 'admin.dashboard.stats.growth',
      value: '18%',
      change: '+2%',
      icon: TrendingUp,
      color: 'text-amber-500 bg-amber-50',
    },
  ];

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.dashboard.title')}</h1>
          <p className="text-slate-500">{t('admin.dashboard.welcomeBack')}</p>
        </div>
        <Button
          onClick={() => setShowOnboardDrawer(true)}
          className="bg-violet-500 hover:bg-violet-600"
        >
          <Plus className="h-4 w-4 me-2" />
          {t('admin.dashboard.onboardTenant')}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.labelKey}
            className="bg-white p-6 rounded border border-slate-200 shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-full">
                {stat.change}
              </span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">{t(stat.labelKey)}</h3>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions / Recent Activity Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm min-h-[300px]">
          <h3 className="font-bold text-slate-800 mb-4">
            {t('admin.dashboard.recentOnboardings')}
          </h3>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">
                    T{i}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Tenant {i} Ltd</p>
                    <p className="text-sm text-slate-500">{t('admin.dashboard.starterPlan')}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">2h {t('admin.dashboard.ago')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm min-h-[300px]">
          <h3 className="font-bold text-slate-800 mb-4">{t('admin.dashboard.systemHealth')}</h3>
          <div className="flex items-center gap-2 text-violet-600 bg-violet-50 p-4 rounded-lg mb-4">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">{t('admin.dashboard.allOperational')}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">{t('admin.dashboard.apiLatency')}</span>
              <span className="font-medium text-slate-900">45ms</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-violet-500 h-2 rounded-full" style={{ width: '15%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Onboard Drawer */}
      <OnboardTenantDrawer open={showOnboardDrawer} onOpenChange={setShowOnboardDrawer} />
    </div>
  );
}
