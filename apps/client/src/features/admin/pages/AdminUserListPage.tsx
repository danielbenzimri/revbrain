import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Loader2, User, Pencil, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ALL_ROLES } from '@revbrain/contract';
import { CreateUserDrawer } from '../components/CreateUserDrawer';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { useAdminUsers, useUpdateAdminUser, useDeleteAdminUser, type AdminUser } from '../hooks';

export default function AdminUserListPage() {
  const { t } = useTranslation();

  // React Query hooks
  const { data: users = [], isLoading } = useAdminUsers();
  const updateMutation = useUpdateAdminUser();
  const deleteMutation = useDeleteAdminUser();

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Derived State (Filtering)
  const filteredUsers = users.filter((user) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      user.email.toLowerCase().includes(searchLower) ||
      user.name.toLowerCase().includes(searchLower) ||
      (user.org || '').toLowerCase().includes(searchLower);

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleRowClick = (user: AdminUser) => {
    setSelectedUser(user);
    setIsDetailDrawerOpen(true);
  };

  const handleUpdateUser = async (id: string, data: Partial<AdminUser>) => {
    await updateMutation.mutateAsync({ userId: id, data });
  };

  const handleDeleteUser = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setIsDetailDrawerOpen(false);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getRoleLabel = (role: string) =>
    t(`admin.users.roles.${role}.label`, role.replace(/_/g, ' '));

  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.users.title')}</h1>
          <p className="text-slate-500">{t('admin.users.subtitle')}</p>
        </div>
        <Button
          onClick={() => setIsCreateDrawerOpen(true)}
          className="bg-violet-600 hover:bg-violet-700 shadow-sm"
        >
          <Plus className="h-4 w-4 me-2" />
          {t('admin.users.inviteUser')}
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded border border-slate-200 shadow-sm transition-all hover:shadow-md space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder={t('admin.users.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ps-10 border-slate-200 focus-visible:ring-violet-500"
            />
          </div>
          <Button
            variant={isFiltersOpen ? 'secondary' : 'outline'}
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className="shrink-0"
          >
            <Filter className="h-4 w-4 me-2" />
            {t('common.filter')}
          </Button>
        </div>

        {isFiltersOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-1">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">
                {t('admin.users.role')}
              </label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full border-slate-200">
                  <SelectValue placeholder={t('admin.users.allRoles')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('admin.users.allRoles')}</SelectItem>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">
                {t('admin.users.table.status')}
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full border-slate-200">
                  <SelectValue placeholder={t('admin.users.allStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('admin.users.allStatus')}</SelectItem>
                  <SelectItem value="active">{t('admin.users.statusActive')}</SelectItem>
                  <SelectItem value="pending">{t('admin.users.pendingInvitation')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Users List */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="bg-slate-50 p-4 rounded-full mb-4">
              <User className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">{t('admin.users.noUsers')}</h3>
            <p className="text-slate-500 max-w-sm">{t('admin.users.noUsersDesc')}</p>
            {(searchTerm || roleFilter !== 'all' || statusFilter !== 'all') && (
              <Button variant="link" onClick={clearFilters} className="mt-2 text-violet-600">
                {t('admin.users.clearFilters')}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-start font-semibold">
                    {t('admin.users.table.user')}
                  </th>
                  <th className="px-6 py-4 text-start font-semibold hidden md:table-cell">
                    {t('admin.users.table.organization')}
                  </th>
                  <th className="px-6 py-4 text-start font-semibold hidden sm:table-cell">
                    {t('admin.users.table.role')}
                  </th>
                  <th className="px-6 py-4 text-start font-semibold">
                    {t('admin.users.table.status')}
                  </th>
                  <th className="px-6 py-4 text-end font-semibold w-[50px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => handleRowClick(user)}
                    className="group hover:bg-violet-50/30 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 text-start">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-slate-200">
                          <AvatarImage src={user.avatarUrl} />
                          <AvatarFallback className="bg-violet-100 text-violet-700 font-bold text-xs">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 group-hover:text-violet-700 transition-colors">
                            {user.name}
                          </span>
                          <span className="text-xs text-slate-500">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-start hidden md:table-cell text-slate-600">
                      {user.org || (
                        <span className="text-slate-400 italic text-xs">
                          {t('admin.users.noOrg')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-start hidden sm:table-cell text-sm text-slate-600">
                      {getRoleLabel(user.role)}
                    </td>
                    <td className="px-6 py-4 text-start">
                      <div
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          user.status === 'active'
                            ? 'bg-violet-100 text-violet-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {user.status === 'active'
                          ? t('admin.users.statusActive')
                          : t('admin.users.statusInvited')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 group-hover:text-violet-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawers */}
      <CreateUserDrawer open={isCreateDrawerOpen} onOpenChange={setIsCreateDrawerOpen} />

      <UserDetailDrawer
        open={isDetailDrawerOpen}
        onOpenChange={setIsDetailDrawerOpen}
        user={selectedUser}
        onSave={handleUpdateUser}
        onDelete={handleDeleteUser}
      />
    </div>
  );
}
