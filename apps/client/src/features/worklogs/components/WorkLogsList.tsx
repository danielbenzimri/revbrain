/**
 * Work Logs List Component
 *
 * Displays a paginated list of work logs with:
 * - Create button
 * - Calendar toggle (future)
 * - Empty state
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Loader2, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkLogs, type WorkLog } from '../hooks/use-work-logs';
import { WorkLogCard } from './WorkLogCard';

interface WorkLogsListProps {
  projectId: string;
  onWorkLogClick?: (workLog: WorkLog) => void;
  onCreateWorkLog?: () => void;
}

const PAGE_SIZE = 10;

export function WorkLogsList({ projectId, onWorkLogClick, onCreateWorkLog }: WorkLogsListProps) {
  const { t } = useTranslation('workLogs');
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useWorkLogs(projectId, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 rounded-lg p-4">
        {error instanceof Error ? error.message : 'Failed to load work logs'}
      </div>
    );
  }

  const workLogs = data?.workLogs || [];
  const pagination = data?.pagination;

  const hasNextPage = pagination ? pagination.hasMore : false;
  const hasPrevPage = page > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded shadow-sm p-4">
        <div>
          <h3 className="font-semibold">{t('title')}</h3>
          <p className="text-sm text-neutral-500">{t('subtitle')}</p>
        </div>
        <Button onClick={onCreateWorkLog}>
          <Plus className="h-4 w-4 me-1" />
          {t('create')}
        </Button>
      </div>

      {/* Work Logs List */}
      {workLogs.length === 0 ? (
        <div className="bg-white rounded shadow-sm p-8 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-neutral-300" />
          <h4 className="font-medium text-neutral-900 mb-1">{t('empty')}</h4>
          <p className="text-sm text-neutral-500 mb-4">{t('emptyDescription')}</p>
          <Button onClick={onCreateWorkLog}>
            <Plus className="h-4 w-4 me-1" />
            {t('create')}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {workLogs.map((workLog) => (
              <WorkLogCard key={workLog.id} workLog={workLog} onClick={onWorkLogClick} />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.total > PAGE_SIZE && (
            <div className="flex items-center justify-between bg-white rounded shadow-sm px-4 py-2">
              <p className="text-sm text-neutral-500">
                {t('common:pagination.showing', {
                  from: page * PAGE_SIZE + 1,
                  to: Math.min((page + 1) * PAGE_SIZE, pagination.total),
                  total: pagination.total,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrevPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNextPage}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
