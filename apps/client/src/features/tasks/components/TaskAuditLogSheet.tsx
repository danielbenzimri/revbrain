/**
 * TaskAuditLogSheet Component
 *
 * Sheet displaying task audit log (deletion history) matching the legacy modal:
 * - Header with title, print, export buttons
 * - Table with columns: Date, User, Action, Task, Created At, Deleted At, Details, Signature
 * - Empty state when no entries
 */
import { useTranslation } from 'react-i18next';
import { FileClock, Printer, Download, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { TaskAuditLogEntry } from '../hooks/use-tasks';

interface TaskAuditLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditLog: TaskAuditLogEntry[];
  onExport: () => void;
  isExporting: boolean;
}

export function TaskAuditLogSheet({
  open,
  onOpenChange,
  auditLog,
  onExport,
  isExporting,
}: TaskAuditLogSheetProps) {
  const { t, i18n } = useTranslation('tasks');
  const isRTL = i18n.language === 'he';

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(i18n.language === 'he' ? 'he-IL' : 'en-US');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US');
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'deleted':
        return t('auditLog.action') === 'Action' ? 'Deleted' : 'נמחק';
      case 'created':
        return t('auditLog.action') === 'Action' ? 'Created' : 'נוצר';
      case 'updated':
        return t('auditLog.action') === 'Action' ? 'Updated' : 'עודכן';
      case 'status_changed':
        return t('auditLog.action') === 'Action' ? 'Status Changed' : 'שינוי סטטוס';
      default:
        return action;
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById('audit-log-table');
    if (!printContent) return;

    const win = window.open('', '', 'height=700,width=1000');
    if (!win) return;

    win.document.write('<html><head><title>' + t('auditLog.title') + '</title>');
    win.document.write(
      '<style>body { font-family: sans-serif; direction: ' +
        (isRTL ? 'rtl' : 'ltr') +
        '; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 8px; text-align: ' +
        (isRTL ? 'right' : 'left') +
        '; } th { background-color: #f2f2f2; }</style>'
    );
    win.document.write('</head><body>');
    win.document.write('<h1>' + t('auditLog.title') + '</h1>');
    win.document.write(printContent.outerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isRTL ? 'left' : 'right'} className="w-full sm:max-w-3xl flex flex-col">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileClock className="text-slate-500" size={20} />
              {t('auditLog.title')}
            </SheetTitle>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrint}
                className="text-slate-500 hover:text-indigo-600"
              >
                <Printer size={18} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onExport}
                disabled={isExporting}
                className="text-slate-500 hover:text-green-600"
              >
                <Download size={18} />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {auditLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <History size={48} className="mb-4 opacity-50" />
              <p>{t('auditLog.empty')}</p>
            </div>
          ) : (
            <table
              id="audit-log-table"
              className={`w-full text-sm ${isRTL ? 'text-right' : 'text-left'}`}
            >
              <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                <tr>
                  <th className="p-3 whitespace-nowrap">{t('auditLog.date')}</th>
                  <th className="p-3 whitespace-nowrap">{t('auditLog.user')}</th>
                  <th className="p-3 whitespace-nowrap">{t('auditLog.action')}</th>
                  <th className="p-3 whitespace-nowrap">{t('auditLog.taskTitle')}</th>
                  <th className="p-3 whitespace-nowrap">{t('auditLog.createdAt')}</th>
                  <th className="p-3 whitespace-nowrap">{t('auditLog.deletedAt')}</th>
                  <th className="p-3 w-1/4">{t('auditLog.details')}</th>
                  <th className="p-3 whitespace-nowrap">{t('auditLog.signature')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500 whitespace-nowrap" dir="ltr">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="p-3 font-medium whitespace-nowrap">{entry.userName}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          entry.action === 'deleted'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {getActionLabel(entry.action)}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-800 whitespace-nowrap">
                      {entry.taskTitle}
                    </td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {entry.action === 'deleted' ? formatDateTime(entry.createdAt) : '-'}
                    </td>
                    <td className="p-3 text-slate-600 leading-relaxed min-w-[150px]">
                      {entry.details || entry.reason || '-'}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {entry.signatureUrl ? (
                        <img
                          src={entry.signatureUrl}
                          alt="Signature"
                          className="h-8 border border-slate-200 rounded bg-white"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
