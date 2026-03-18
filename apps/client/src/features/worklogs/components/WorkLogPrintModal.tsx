/**
 * WorkLogPrintModal Component
 *
 * Print modal that matches the legacy WorkLogsView print layout exactly
 */
import { useTranslation } from 'react-i18next';
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkLog, WeatherType } from '../hooks/use-work-logs';

interface WorkLogPrintModalProps {
  workLog: WorkLog;
  projectData: {
    name: string;
    contractorName?: string;
    clientName?: string;
    contractNumber?: string;
  };
  onClose: () => void;
}

const WEATHER_LABELS: Record<WeatherType, { en: string; he: string }> = {
  sunny: { en: 'Sunny', he: 'שמשי' },
  cloudy: { en: 'Cloudy', he: 'מעונן' },
  rainy: { en: 'Rainy', he: 'גשום' },
  hot: { en: 'Hot', he: 'חם' },
  stormy: { en: 'Stormy', he: 'סוער' },
  cold: { en: 'Cold', he: 'קר' },
  windy: { en: 'Windy', he: 'סוער' },
  snowy: { en: 'Snowy', he: 'שלג' },
  foggy: { en: 'Foggy', he: 'ערפילי' },
};

export function WorkLogPrintModal({ workLog, projectData, onClose }: WorkLogPrintModalProps) {
  const { t, i18n } = useTranslation('workLogs');
  const isHebrew = i18n.language === 'he';
  const locale = isHebrew ? 'he-IL' : 'en-US';

  const handlePrint = () => {
    window.print();
  };

  const weatherLabel = workLog.weatherType
    ? WEATHER_LABELS[workLog.weatherType]?.[isHebrew ? 'he' : 'en'] || workLog.weatherType
    : '-';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:p-0 print:bg-white print:backdrop-blur-none">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto print:max-w-none print:max-h-none print:shadow-none print:rounded-none">
        {/* Print Header (no-print buttons) */}
        <div className="flex justify-between items-center p-4 border-b print:hidden">
          <h2 className="text-xl font-bold text-slate-800">{t('actions.printPreview')}</h2>
          <div className="flex gap-2">
            <Button onClick={handlePrint} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Printer size={18} />
              {t('actions.print')}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={20} />
            </Button>
          </div>
        </div>

        {/* Printable Content */}
        <div className="p-6 print:p-4" dir={isHebrew ? 'rtl' : 'ltr'}>
          {/* Date Header */}
          <div className="text-center text-sm text-slate-500 mb-2 print:text-black">
            {new Date(workLog.logDate).toLocaleDateString(locale)}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-center mb-6 print:text-black">
            {t('log.logNumber', { number: workLog.logNumber })}
          </h1>

          {/* Project Info Table */}
          <table className="w-full border-collapse border border-slate-400 mb-4 text-sm">
            <tbody>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium w-1/6">
                  {t('projectInfo.projectName')}
                </td>
                <td className="border border-slate-400 p-2">{projectData.name}</td>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium w-1/6">
                  {t('projectInfo.workName')}
                </td>
                <td className="border border-slate-400 p-2">{projectData.name}</td>
              </tr>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium">
                  {t('projectInfo.contractorName')}
                </td>
                <td className="border border-slate-400 p-2">{projectData.contractorName || '-'}</td>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium">
                  {t('projectInfo.clientName')}
                </td>
                <td className="border border-slate-400 p-2">{projectData.clientName || '-'}</td>
              </tr>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium">
                  {t('projectInfo.siteName')}
                </td>
                <td className="border border-slate-400 p-2">{projectData.name}</td>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium">
                  {t('projectInfo.contractNumber')}
                </td>
                <td className="border border-slate-400 p-2">{projectData.contractNumber || '-'}</td>
              </tr>
            </tbody>
          </table>

          {/* Status & Weather Table */}
          <table className="w-full border-collapse border border-slate-400 mb-4 text-sm">
            <tbody>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium w-1/6">
                  {t('status.title')}
                </td>
                <td className="border border-slate-400 p-2">
                  {workLog.status === 'approved'
                    ? t('status.approved')
                    : workLog.status === 'submitted'
                      ? t('status.submitted')
                      : t('status.draft')}
                </td>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium w-1/6">
                  {t('log.date')}
                </td>
                <td className="border border-slate-400 p-2">
                  {new Date(workLog.logDate).toLocaleDateString(locale)}
                </td>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium w-1/6">
                  {t('log.weather')}
                </td>
                <td className="border border-slate-400 p-2">{weatherLabel}</td>
              </tr>
            </tbody>
          </table>

          {/* Resources Section */}
          <h3 className="text-lg font-bold mb-2 mt-6">{t('sections.inventory')}</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Contractor Resources */}
            <div>
              <h4 className="font-medium mb-2 text-sm bg-slate-100 p-2 border border-slate-400">
                {t('contractorResources.title')}
              </h4>
              <table className="w-full border-collapse border border-slate-400 text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-400 p-1 text-start">
                      {t('resources.trade')}
                    </th>
                    <th className="border border-slate-400 p-1 w-16 text-center">
                      {t('resources.contractorCount')}
                    </th>
                    <th className="border border-slate-400 p-1 w-16 text-center">
                      {t('resources.supervisorCount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(workLog.contractorResources || [])
                    .filter((r) => r.contractorCount > 0 || r.supervisorCount > 0)
                    .map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-400 p-1">{r.type}</td>
                        <td className="border border-slate-400 p-1 text-center">
                          {r.contractorCount || ''}
                        </td>
                        <td className="border border-slate-400 p-1 text-center">
                          {r.supervisorCount || ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* External Resources */}
            <div>
              <h4 className="font-medium mb-2 text-sm bg-slate-100 p-2 border border-slate-400">
                {t('externalResources.title')}
              </h4>
              <table className="w-full border-collapse border border-slate-400 text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-400 p-1 text-start">
                      {t('resources.trade')}
                    </th>
                    <th className="border border-slate-400 p-1 w-16 text-center">
                      {t('resources.contractorCount')}
                    </th>
                    <th className="border border-slate-400 p-1 w-16 text-center">
                      {t('resources.supervisorCount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(workLog.externalResources || [])
                    .filter((r) => r.contractorCount > 0 || r.supervisorCount > 0)
                    .map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-400 p-1">{r.type}</td>
                        <td className="border border-slate-400 p-1 text-center">
                          {r.contractorCount || ''}
                        </td>
                        <td className="border border-slate-400 p-1 text-center">
                          {r.supervisorCount || ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Work Descriptions */}
          <h3 className="text-lg font-bold mb-2 mt-6">{t('sections.workDescriptions')}</h3>
          <table className="w-full border-collapse border border-slate-400 mb-4 text-sm">
            <tbody>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium w-1/4 align-top">
                  {t('descriptions.contractor')}
                </td>
                <td className="border border-slate-400 p-2 whitespace-pre-wrap">
                  {workLog.contractorWorkDescription || '—'}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium align-top">
                  {t('descriptions.supervisor')}
                </td>
                <td className="border border-slate-400 p-2 whitespace-pre-wrap">
                  {workLog.supervisorWorkDescription || '—'}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Notes */}
          <h3 className="text-lg font-bold mb-2 mt-6">{t('sections.notes')}</h3>
          <table className="w-full border-collapse border border-slate-400 mb-4 text-sm">
            <tbody>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium w-1/4 align-top">
                  {t('notes.contractor')}
                </td>
                <td className="border border-slate-400 p-2 whitespace-pre-wrap">
                  {workLog.contractorNotes || '—'}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-400 p-2 bg-slate-50 font-medium align-top">
                  {t('notes.supervisor')}
                </td>
                <td className="border border-slate-400 p-2 whitespace-pre-wrap">
                  {workLog.supervisorNotes || '—'}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Traffic Controllers */}
          {workLog.trafficControllersInfo && (
            <>
              <h3 className="text-lg font-bold mb-2 mt-6">{t('log.trafficControllers')}</h3>
              <table className="w-full border-collapse border border-slate-400 mb-4 text-sm">
                <tbody>
                  <tr>
                    <td className="border border-slate-400 p-2 whitespace-pre-wrap">
                      {workLog.trafficControllersInfo}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Signatures */}
          {workLog.auditLog && workLog.auditLog.filter((e) => e.action === 'signed').length > 0 && (
            <>
              <h3 className="text-lg font-bold mb-2 mt-6">{t('signatures.title')}</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {workLog.auditLog
                  .filter((entry) => entry.action === 'signed')
                  .map((sig) => (
                    <div key={sig.id} className="border border-slate-400 p-3">
                      <div className="text-xs font-medium text-slate-500 mb-2">
                        {sig.role === 'contractor'
                          ? t('signatures.contractor')
                          : t('signatures.inspector')}
                      </div>
                      <div className="text-sm">
                        <div className="font-medium">{sig.userName}</div>
                        <div className="text-slate-600">{sig.company}</div>
                        <div className="text-xs text-slate-500">
                          {sig.role} • {new Date(sig.timestamp).toLocaleDateString(locale)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
