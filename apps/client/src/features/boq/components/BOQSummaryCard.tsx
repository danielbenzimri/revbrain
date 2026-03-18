/**
 * BOQ Summary Card
 *
 * Displays summary statistics for a project's Bill of Quantities:
 * - Total items count
 * - Categories (root level items)
 * - Total contract value
 * - Export to Excel button
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Hash, FolderTree, Banknote, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBOQSummary, useExportBOQ } from '../hooks/use-boq';

interface BOQSummaryCardProps {
  projectId: string;
  projectName?: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const BOQSummaryCard = memo(function BOQSummaryCard({
  projectId,
  projectName,
}: BOQSummaryCardProps) {
  const { t } = useTranslation();
  const { data: summary, isLoading } = useBOQSummary(projectId);
  const exportMutation = useExportBOQ();

  const handleExport = () => {
    exportMutation.mutate({ projectId, projectName });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded shadow-sm p-6">
        <div className="flex items-center justify-center h-24">
          <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="bg-white rounded shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <FileSpreadsheet className="h-5 w-5" />
          <h3 className="font-semibold">{t('boq.summary.title')}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          disabled={exportMutation.isPending || summary.totalItems === 0}
          className="text-white hover:bg-white/20 hover:text-white"
        >
          {exportMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin me-1" />
          ) : (
            <Download className="h-4 w-4 me-1" />
          )}
          {exportMutation.isPending ? t('boq.export.exporting') : t('boq.export.button')}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-3 gap-4">
        {/* Total Items */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-neutral-500 mb-1">
            <Hash className="h-4 w-4" />
            <span className="text-xs">{t('boq.summary.totalItems')}</span>
          </div>
          <p className="text-2xl font-bold font-mono text-neutral-900">{summary.totalItems}</p>
        </div>

        {/* Categories */}
        <div className="text-center border-x border-neutral-100">
          <div className="flex items-center justify-center gap-1.5 text-neutral-500 mb-1">
            <FolderTree className="h-4 w-4" />
            <span className="text-xs">{t('boq.summary.categories')}</span>
          </div>
          <p className="text-2xl font-bold font-mono text-neutral-900">{summary.categories}</p>
        </div>

        {/* Total Value */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-neutral-500 mb-1">
            <Banknote className="h-4 w-4" />
            <span className="text-xs">{t('boq.summary.totalValue')}</span>
          </div>
          <p className="text-lg font-bold font-mono text-teal-600">
            {formatCurrency(summary.totalValueCents)}
          </p>
        </div>
      </div>
    </div>
  );
});
