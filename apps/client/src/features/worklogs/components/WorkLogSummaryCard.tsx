/**
 * Work Log Summary Card Component
 *
 * Displays summary statistics for work logs:
 * - Total logs
 * - Signed by contractor/inspector counts
 * - Total worker hours
 * - Total equipment hours
 */
import { useTranslation } from 'react-i18next';
import { Loader2, FileText, Users, Truck, CheckCircle, PenTool } from 'lucide-react';
import { useWorkLogSummary } from '../hooks/use-work-logs';

interface WorkLogSummaryCardProps {
  projectId: string;
}

export function WorkLogSummaryCard({ projectId }: WorkLogSummaryCardProps) {
  const { t } = useTranslation('workLogs');
  const { data: summary, isLoading, error } = useWorkLogSummary(projectId);

  if (isLoading) {
    return (
      <div className="bg-white rounded shadow-sm p-6 flex items-center justify-center h-24">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error || !summary) {
    return null;
  }

  const stats = [
    {
      label: t('summary.totalLogs'),
      value: summary.totalLogs,
      icon: FileText,
      color: 'text-blue-600 bg-blue-100',
    },
    {
      label: t('summary.signedByContractor'),
      value: summary.signedByContractor,
      icon: PenTool,
      color: 'text-emerald-600 bg-emerald-100',
    },
    {
      label: t('summary.signedByInspector'),
      value: summary.signedByInspector,
      icon: CheckCircle,
      color: 'text-purple-600 bg-purple-100',
    },
    {
      label: t('summary.totalManHours'),
      value: summary.totalWorkerHours.toLocaleString(),
      icon: Users,
      color: 'text-orange-600 bg-orange-100',
    },
    {
      label: t('summary.totalEquipmentHours'),
      value: summary.totalEquipmentHours.toLocaleString(),
      icon: Truck,
      color: 'text-amber-600 bg-amber-100',
    },
  ];

  return (
    <div className="bg-white rounded shadow-sm p-4">
      <h4 className="font-medium text-sm text-neutral-500 mb-3">{t('summary.title')}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stat.color}`}>
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold font-mono">{stat.value}</p>
              <p className="text-xs text-neutral-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
