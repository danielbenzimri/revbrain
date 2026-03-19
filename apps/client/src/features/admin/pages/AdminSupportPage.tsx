import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  Loader2,
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
import { useTicketStats, useSupportTickets, type SupportTicket } from '../hooks';
import { TicketDetailDrawer } from '../components/TicketDetailDrawer';
import { formatDistanceToNow } from 'date-fns';

export default function AdminSupportPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useTicketStats();
  const {
    data: ticketsData,
    isLoading: ticketsLoading,
    refetch: refetchTickets,
  } = useSupportTickets({
    status: statusFilter === 'all' ? undefined : statusFilter,
    priority: priorityFilter === 'all' ? undefined : priorityFilter,
    search: search || undefined,
    limit: 50,
  });

  const tickets = ticketsData?.tickets || [];
  const isLoading = statsLoading || ticketsLoading;

  const handleRefresh = () => {
    refetchStats();
    refetchTickets();
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-red-50 text-red-600 border-red-200';
      case 'in_progress':
        return 'bg-violet-50 text-violet-600 border-violet-200';
      case 'waiting_customer':
        return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'resolved':
        return 'bg-violet-50 text-violet-600 border-violet-200';
      case 'closed':
        return 'bg-slate-100 text-slate-500 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 font-semibold';
      case 'high':
        return 'text-orange-600 font-medium';
      case 'medium':
        return 'text-slate-600';
      case 'low':
        return 'text-slate-400';
      default:
        return 'text-slate-600';
    }
  };

  const formatStatus = (status: string) => {
    return t(`admin.support.status.${status}`, status.replace(/_/g, ' '));
  };

  const formatPriority = (priority: string) => {
    return t(`admin.support.priority.${priority}`, priority);
  };

  const formatTimeAgo = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: false });
    } catch {
      return date;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.support.title')}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('common.refresh', 'Refresh')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<MessageSquare className="h-5 w-5 text-violet-500" />}
          label={t('admin.support.stats.open')}
          value={stats?.open ?? 0}
          sublabel={t('admin.support.stats.needsAttention')}
          loading={statsLoading}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          label={t('admin.support.stats.inProgress')}
          value={stats?.inProgress ?? 0}
          sublabel={t('admin.support.stats.beingHandled')}
          loading={statsLoading}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          label={t('admin.support.stats.highPriority')}
          value={stats?.highPriority ?? 0}
          sublabel={t('admin.support.stats.urgent')}
          loading={statsLoading}
          highlight={stats?.highPriority ? stats.highPriority > 0 : false}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-violet-500" />}
          label={t('admin.support.stats.resolved')}
          value={stats?.resolved ?? 0}
          sublabel={t('admin.support.stats.thisWeek')}
          loading={statsLoading}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={t('admin.support.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('admin.support.filter.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.support.filter.allStatus')}</SelectItem>
              <SelectItem value="open">{t('admin.support.status.open')}</SelectItem>
              <SelectItem value="in_progress">{t('admin.support.status.in_progress')}</SelectItem>
              <SelectItem value="waiting_customer">
                {t('admin.support.status.waiting_customer')}
              </SelectItem>
              <SelectItem value="resolved">{t('admin.support.status.resolved')}</SelectItem>
              <SelectItem value="closed">{t('admin.support.status.closed')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t('admin.support.filter.priority')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.support.filter.allPriority')}</SelectItem>
              <SelectItem value="urgent">{t('admin.support.priority.urgent')}</SelectItem>
              <SelectItem value="high">{t('admin.support.priority.high')}</SelectItem>
              <SelectItem value="medium">{t('admin.support.priority.medium')}</SelectItem>
              <SelectItem value="low">{t('admin.support.priority.low')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        {ticketsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <MessageSquare className="h-10 w-10 text-slate-300 mb-3" />
            <p className="font-medium">{t('admin.support.noTickets')}</p>
            <p className="text-sm text-slate-400">{t('admin.support.noTicketsHint')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.support.table.ticket')}
                </th>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.support.table.user')}
                </th>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.support.table.subject')}
                </th>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.support.table.status')}
                </th>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.support.table.priority')}
                </th>
                <th className="px-6 py-4 text-start font-medium">
                  {t('admin.support.table.created')}
                </th>
                <th className="px-6 py-4 text-end font-medium">
                  {t('admin.support.table.action')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket: SupportTicket) => (
                <tr
                  key={ticket.id}
                  className="hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <td className="px-6 py-4 text-start">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                      {ticket.ticketNumber}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-start">
                    <div>
                      <p className="font-medium text-slate-700">{ticket.user?.fullName || '-'}</p>
                      <p className="text-xs text-slate-400">{ticket.organization?.name || '-'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-start max-w-xs truncate">{ticket.subject}</td>
                  <td className="px-6 py-4 text-start">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyle(ticket.status)}`}
                    >
                      {formatStatus(ticket.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-start">
                    <span className={getPriorityStyle(ticket.priority)}>
                      {formatPriority(ticket.priority)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-start text-slate-500">
                    {formatTimeAgo(ticket.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTicketId(ticket.id);
                      }}
                    >
                      {t('admin.support.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination info */}
      {ticketsData?.pagination && (
        <div className="flex justify-between items-center text-sm text-slate-500">
          <span>
            {t('admin.support.showingTickets', {
              count: tickets.length,
              total: ticketsData.pagination.total,
            })}
          </span>
          {ticketsData.pagination.hasMore && (
            <Button variant="ghost" size="sm">
              {t('common.loadMore', 'Load more')}
            </Button>
          )}
        </div>
      )}

      {/* Ticket Detail Drawer */}
      <TicketDetailDrawer
        open={!!selectedTicketId}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
        ticketId={selectedTicketId}
        onUpdate={() => {
          refetchTickets();
          refetchStats();
        }}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  loading,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel: string;
  loading?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white p-5 rounded border shadow-sm ${highlight ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}
    >
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <h3 className="font-semibold text-slate-700">{label}</h3>
      </div>
      {loading ? (
        <div className="h-8 w-16 bg-slate-100 animate-pulse rounded" />
      ) : (
        <p className={`text-2xl font-bold ${highlight ? 'text-red-600' : 'text-slate-900'}`}>
          {value}
        </p>
      )}
      <p className="text-sm text-slate-500">{sublabel}</p>
    </div>
  );
}
