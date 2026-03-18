/**
 * User Management Page (Project/Organization Level)
 *
 * Displays organization team members with role hierarchy.
 * Uses server API via useOrgUsers hook.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Building2,
  CheckCircle,
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useOrgUsers, type OrgUser } from '@/features/org/hooks/use-org-users';
import { cn } from '@/lib/utils';

// Role display configuration
const ROLE_CONFIG: Record<
  string,
  { label: string; labelHe: string; color: string; group: 'management' | 'team' | 'admin' }
> = {
  system_admin: {
    label: 'System Admin',
    labelHe: 'מנהל מערכת',
    color: 'bg-purple-100 text-purple-800',
    group: 'admin',
  },
  org_owner: {
    label: 'Organization Owner',
    labelHe: 'בעלי הארגון',
    color: 'bg-blue-100 text-blue-800',
    group: 'management',
  },
  admin: {
    label: 'Admin',
    labelHe: 'מנהל',
    color: 'bg-sky-100 text-sky-800',
    group: 'management',
  },
  operator: {
    label: 'Operator',
    labelHe: 'מפעיל',
    color: 'bg-teal-100 text-teal-800',
    group: 'team',
  },
  reviewer: {
    label: 'Reviewer',
    labelHe: 'סוקר',
    color: 'bg-green-100 text-green-800',
    group: 'team',
  },
};

function getRoleInfo(role: string, lang: 'en' | 'he') {
  const config = ROLE_CONFIG[role];
  if (!config) {
    return { label: role, color: 'bg-gray-100 text-gray-800' };
  }
  return {
    label: lang === 'he' ? config.labelHe : config.label,
    color: config.color,
  };
}

function UserCard({ user, lang }: { user: OrgUser; lang: 'en' | 'he' }) {
  const roleInfo = getRoleInfo(user.role, lang);
  const isActive = user.isActive && user.activatedAt;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium text-lg">
            {user.fullName
              ? user.fullName.charAt(0).toUpperCase()
              : user.email.charAt(0).toUpperCase()}
          </div>

          {/* Name and email */}
          <div>
            <h3 className="font-medium text-slate-900">
              {user.fullName || user.email.split('@')[0]}
            </h3>
            <p className="text-sm text-slate-500 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {user.email}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="w-3 h-3" />
              {lang === 'he' ? 'פעיל' : 'Active'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <Clock className="w-3 h-3" />
              {lang === 'he' ? 'ממתין להפעלה' : 'Pending'}
            </span>
          )}
        </div>
      </div>

      {/* Role badge */}
      <div className="mt-3 flex items-center gap-2">
        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', roleInfo.color)}>
          {roleInfo.label}
        </span>
        {user.isOrgAdmin && (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {lang === 'he' ? 'מנהל' : 'Admin'}
          </span>
        )}
      </div>

      {/* Additional info */}
      {user.lastLoginAt && (
        <p className="mt-2 text-xs text-slate-400">
          {lang === 'he' ? 'התחברות אחרונה:' : 'Last login:'}{' '}
          {new Date(user.lastLoginAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
        </p>
      )}
    </div>
  );
}

export default function UsersPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'he' ? 'he' : 'en';
  const { data: users, isLoading, error } = useOrgUsers();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    management: true,
    team: true,
    admin: true,
  });

  // Filter users by search term
  const filteredUsers = (users || []).filter(
    (user) =>
      user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group users by their role type
  const groupedUsers = filteredUsers.reduce(
    (acc, user) => {
      const config = ROLE_CONFIG[user.role];
      const group = config?.group || 'team';
      if (!acc[group]) acc[group] = [];
      acc[group].push(user);
      return acc;
    },
    {} as Record<string, OrgUser[]>
  );

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 h-full">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 h-full">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {lang === 'he' ? 'שגיאה בטעינת משתמשים' : 'Error loading users'}
        </div>
      </div>
    );
  }

  const groupLabels: Record<string, { en: string; he: string }> = {
    admin: { en: 'Administrators', he: 'מנהלי מערכת' },
    management: { en: 'Management', he: 'הנהלה' },
    team: { en: 'Team Members', he: 'חברי צוות' },
  };

  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'he' ? 'ניהול משתמשים' : 'User Management'}
          </h1>
        </div>

        {/* TODO: Add invite button for admins */}
        <button
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          disabled
          title={lang === 'he' ? 'בקרוב' : 'Coming soon'}
        >
          <UserPlus className="w-4 h-4" />
          {lang === 'he' ? 'הזמן משתמש' : 'Invite User'}
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={
              lang === 'he'
                ? 'חיפוש לפי שם, אימייל או תפקיד...'
                : 'Search by name, email or role...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">{lang === 'he' ? 'סה"כ משתמשים' : 'Total Users'}</p>
          <p className="text-2xl font-bold text-slate-900">{users?.length || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">{lang === 'he' ? 'פעילים' : 'Active'}</p>
          <p className="text-2xl font-bold text-green-600">
            {users?.filter((u) => u.isActive && u.activatedAt).length || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">{lang === 'he' ? 'הנהלה' : 'Management'}</p>
          <p className="text-2xl font-bold text-blue-600">{groupedUsers.management?.length || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">{lang === 'he' ? 'חברי צוות' : 'Team Members'}</p>
          <p className="text-2xl font-bold text-green-600">{groupedUsers.team?.length || 0}</p>
        </div>
      </div>

      {/* User groups */}
      <div className="space-y-4">
        {(['admin', 'management', 'team'] as const).map((group) => {
          const groupUsers = groupedUsers[group] || [];
          if (groupUsers.length === 0) return null;

          return (
            <div
              key={group}
              className="bg-white rounded-lg border border-slate-200 overflow-hidden"
            >
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-slate-600" />
                  <h2 className="font-semibold text-slate-900">
                    {lang === 'he' ? groupLabels[group].he : groupLabels[group].en}
                  </h2>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-sm">
                    {groupUsers.length}
                  </span>
                </div>
                {expandedGroups[group] ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {/* Group users */}
              {expandedGroups[group] && (
                <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupUsers.map((user) => (
                    <UserCard key={user.id} user={user} lang={lang} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredUsers.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          {searchTerm
            ? lang === 'he'
              ? 'לא נמצאו משתמשים התואמים לחיפוש'
              : 'No users match your search'
            : lang === 'he'
              ? 'אין משתמשים בארגון'
              : 'No users in organization'}
        </div>
      )}
    </div>
  );
}
