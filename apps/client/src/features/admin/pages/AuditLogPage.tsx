import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  Download,
  ScrollText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogs, type AuditLogEntry } from '../hooks';
import { formatDistanceToNow } from 'date-fns';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

const PAGE_SIZE = 50;

/** Known audit action types for the filter dropdown */
const AUDIT_ACTIONS = [
  'user.created',
  'user.updated',
  'user.deleted',
  'user.invited',
  'user.activated',
  'user.deactivated',
  'user.role_changed',
  'org.created',
  'org.updated',
  'org.deactivated',
  'org.plan_changed',
  'plan.created',
  'plan.updated',
  'plan.deleted',
  'coupon.created',
  'coupon.updated',
  'coupon.deactivated',
  'coupon.synced_to_stripe',
  'ticket.status_changed',
  'ticket.replied',
  'ticket.assigned',
  'billing.subscription_created',
  'billing.subscription_updated',
  'billing.invoice_created',
  'auth.login',
  'auth.logout',
  'auth.password_reset',
];

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const filters = {
    action: actionFilter === 'all' ? undefined : actionFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading } = useAuditLogs(filters);

  const entries = data?.entries || [];
  const pagination = data?.pagination;

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExportCSV = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (search) params.set('search', search);

      const url = `${apiUrl}/v1/admin/audit/export${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, { headers });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      // silently fail — could add toast later
    }
  }, [actionFilter, dateFrom, dateTo, search]);

  const formatTimeAgo = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return date;
    }
  };

  const formatAction = (action: string) => {
    return action
      .replace(/\./g, ' > ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getActorDisplay = (entry: AuditLogEntry) => {
    if (entry.metadata && typeof entry.metadata === 'object') {
      const meta = entry.metadata as Record<string, unknown>;
      if (meta.actorEmail) return String(meta.actorEmail);
      if (meta.actorName) return String(meta.actorName);
    }
    return entry.userId || '-';
  };

  const getTargetDisplay = (entry: AuditLogEntry) => {
    if (entry.metadata && typeof entry.metadata === 'object') {
      const meta = entry.metadata as Record<string, unknown>;
      if (meta.targetEmail) return String(meta.targetEmail);
      if (meta.targetName) return String(meta.targetName);
    }
    return entry.targetUserId || '-';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.audit.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('admin.audit.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
          <Download className="h-4 w-4" />
          {t('admin.audit.export')}
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={t('admin.audit.filters.search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="ps-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select
            value={actionFilter}
            onValueChange={(val) => {
              setActionFilter(val);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('admin.audit.filters.action')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.audit.filters.action')}</SelectItem>
              {AUDIT_ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {formatAction(action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            placeholder={t('admin.audit.filters.dateFrom')}
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
            className="w-40"
          />
          <span className="text-slate-400">-</span>
          <Input
            type="date"
            placeholder={t('admin.audit.filters.dateTo')}
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
            className="w-40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <ScrollText className="h-10 w-10 text-slate-300 mb-3" />
            <p className="font-medium">{t('admin.audit.noEntries')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 text-start font-medium">{t('admin.audit.table.time')}</th>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.audit.table.action')}
                </th>
                <th className="px-6 py-4 text-start font-medium">{t('admin.audit.table.actor')}</th>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.audit.table.target')}
                </th>
                <th className="px-6 py-4 text-start font-medium">{t('admin.audit.table.ip')}</th>
                <th className="px-6 py-4 text-end font-medium">{t('admin.audit.table.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => {
                const isExpanded = expandedRows.has(entry.id);
                return (
                  <RowGroup key={entry.id}>
                    <tr
                      className="hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => toggleRow(entry.id)}
                    >
                      <td className="px-6 py-4 text-start text-slate-500 whitespace-nowrap">
                        {formatTimeAgo(entry.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-start">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-50 text-slate-700 border-slate-200">
                          {formatAction(entry.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-start text-slate-700 max-w-xs truncate">
                        {getActorDisplay(entry)}
                      </td>
                      <td className="px-6 py-4 text-start text-slate-500 max-w-xs truncate">
                        {getTargetDisplay(entry)}
                      </td>
                      <td className="px-6 py-4 text-start">
                        <span className="font-mono text-xs text-slate-400">
                          {entry.ipAddress || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(entry.id);
                          }}
                        >
                          {isExpanded ? (
                            <>
                              {t('admin.audit.hideDetails')}
                              <ChevronUp className="h-3 w-3" />
                            </>
                          ) : (
                            <>
                              {t('admin.audit.showDetails')}
                              <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={6} className="px-6 py-4">
                          <MetadataView entry={entry} />
                        </td>
                      </tr>
                    )}
                  </RowGroup>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex justify-between items-center text-sm text-slate-500">
          <span>
            {t('admin.support.showingTickets', {
              count: entries.length,
              total: pagination.total,
            }).replace('tickets', 'entries')}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fragment wrapper for table row groups (main row + detail row) */
function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Expandable metadata viewer for an audit entry */
function MetadataView({ entry }: { entry: AuditLogEntry }) {
  const { t } = useTranslation();
  const metadata = entry.metadata;

  if (!metadata || Object.keys(metadata).length === 0) {
    return <p className="text-sm text-slate-400 italic">{t('admin.audit.noEntries')}</p>;
  }

  // Check for before/after diffs
  const hasDiff = metadata.before && metadata.after;

  return (
    <div className="space-y-3">
      {hasDiff && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase">Before</p>
            <pre className="text-xs bg-red-50 border border-red-200 rounded p-3 overflow-auto max-h-40 text-red-800">
              {JSON.stringify(metadata.before, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase">After</p>
            <pre className="text-xs bg-green-50 border border-green-200 rounded p-3 overflow-auto max-h-40 text-green-800">
              {JSON.stringify(metadata.after, null, 2)}
            </pre>
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase">
          {t('admin.audit.table.details')}
        </p>
        <pre className="text-xs bg-slate-100 border border-slate-200 rounded p-3 overflow-auto max-h-48 text-slate-700">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </div>
      {entry.userAgent && (
        <p className="text-xs text-slate-400 truncate">
          <span className="font-medium">User Agent:</span> {entry.userAgent}
        </p>
      )}
    </div>
  );
}
