import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  MoreHorizontal,
  Building2,
  User,
  Loader2,
  Edit,
  Trash2,
  Shield,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardTenantDrawer } from '../components/OnboardTenantDrawer';
import { EditTenantDrawer } from '../components/EditTenantDrawer';
import { TenantOverridesDrawer } from '../components/TenantOverridesDrawer';
import { ImpersonationReasonSheet } from '../components/ImpersonationReasonSheet';
import { useTenants, useDeactivateTenant, type Tenant, type TenantForEdit } from '../hooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function TenantListPage() {
  const { t } = useTranslation();
  const [showOnboardDrawer, setShowOnboardDrawer] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showOverridesDrawer, setShowOverridesDrawer] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantForEdit | null>(null);
  const [overridesTenant, setOverridesTenant] = useState<{ orgId: string; orgName: string } | null>(
    null
  );
  const [showImpersonateSheet, setShowImpersonateSheet] = useState(false);
  const [impersonateTenant, setImpersonateTenant] = useState<{ id: string; name: string } | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');

  // React Query hooks - data cached for 1 minute
  const { data: tenants = [], isLoading } = useTenants();
  const deactivateMutation = useDeactivateTenant();

  const handleEdit = (tenant: Tenant) => {
    setSelectedTenant({
      id: tenant.id,
      name: tenant.name,
      type: tenant.type as string,
      planId: tenant.plan?.id || null,
      seatLimit: tenant.seatLimit,
      seatUsed: tenant.seatUsed,
      isActive: tenant.isActive,
    });
    setShowEditDrawer(true);
  };

  const handleManageOverrides = (tenant: Tenant) => {
    setOverridesTenant({ orgId: tenant.id, orgName: tenant.name });
    setShowOverridesDrawer(true);
  };

  const handleImpersonate = (tenant: Tenant) => {
    setImpersonateTenant({ id: tenant.id, name: tenant.name });
    setShowImpersonateSheet(true);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm(t('admin.tenants.deactivateConfirm'))) return;
    deactivateMutation.mutate(id);
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.tenants.title')}</h1>
          <p className="text-slate-500">{t('admin.tenants.subtitle')}</p>
        </div>
        <Button
          onClick={() => setShowOnboardDrawer(true)}
          className="bg-violet-500 hover:bg-violet-600"
        >
          <Plus className="h-4 w-4 me-2" />
          {t('admin.tenants.onboardTenant')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white p-4 rounded border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.tenants.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-10 pe-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-violet-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden min-h-[300px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500">{t('admin.tenants.noTenants')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-4 text-start">{t('admin.tenants.table.organization')}</th>
                <th className="px-6 py-4 text-start">{t('admin.tenants.table.type')}</th>
                <th className="px-6 py-4 text-start">{t('admin.tenants.table.plan')}</th>
                <th className="px-6 py-4 text-start">{t('admin.tenants.table.users')}</th>
                <th className="px-6 py-4 text-start">
                  {t('admin.tenants.table.storage', 'Storage')}
                </th>
                <th className="px-6 py-4 text-start">{t('admin.tenants.table.status')}</th>
                <th className="px-6 py-4 text-end">{t('admin.tenants.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-start">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <Link
                          to={`/admin/tenants/${tenant.id}`}
                          className="font-medium text-slate-900 hover:text-violet-600 hover:underline"
                        >
                          {tenant.name}
                        </Link>
                        <p className="text-xs text-slate-500">{tenant.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-start capitalize">
                    {t(`admin.tenants.${tenant.type}`)}
                  </td>
                  <td className="px-6 py-4 text-start">
                    {tenant.plan ? (
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600">
                        {tenant.plan.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-start">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <User className="h-3.5 w-3.5" />
                      {tenant.seatUsed} / {tenant.seatLimit}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-start">
                    <span className="text-sm text-slate-600">
                      {tenant.storageUsedBytes
                        ? tenant.storageUsedBytes >= 1024 * 1024 * 1024
                          ? `${(tenant.storageUsedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                          : `${Math.round(tenant.storageUsedBytes / (1024 * 1024))} MB`
                        : '0 MB'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-start">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        tenant.isActive ? 'bg-violet-50 text-violet-600' : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {tenant.isActive ? t('admin.tenants.active') : t('admin.tenants.inactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4 text-slate-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEdit(tenant)}>
                          <Edit className="h-4 w-4 me-2" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleManageOverrides(tenant)}>
                          <Shield className="h-4 w-4 me-2" />
                          {t('admin.tenants.manageOverrides', 'Manage Overrides')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleImpersonate(tenant)}>
                          <Eye className="h-4 w-4 me-2" />
                          {t('admin.impersonation.loginAsOwner')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeactivate(tenant.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 me-2" />
                          {t('admin.tenants.deactivate')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Onboard Drawer */}
      <OnboardTenantDrawer open={showOnboardDrawer} onOpenChange={setShowOnboardDrawer} />

      {/* Edit Drawer */}
      <EditTenantDrawer
        open={showEditDrawer}
        onOpenChange={setShowEditDrawer}
        tenant={selectedTenant}
      />

      {/* Overrides Drawer */}
      <TenantOverridesDrawer
        open={showOverridesDrawer}
        onOpenChange={setShowOverridesDrawer}
        orgId={overridesTenant?.orgId ?? null}
        orgName={overridesTenant?.orgName ?? ''}
      />

      {/* Impersonation Reason Sheet */}
      <ImpersonationReasonSheet
        open={showImpersonateSheet}
        onOpenChange={setShowImpersonateSheet}
        tenant={impersonateTenant}
      />
    </div>
  );
}
