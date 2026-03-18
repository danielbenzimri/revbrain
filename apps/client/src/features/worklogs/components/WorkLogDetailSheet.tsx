/**
 * Work Log Detail Sheet Component
 *
 * Displays full work log details with:
 * - Weather info
 * - Resources table
 * - Equipment table
 * - Activities, Issues, Safety notes
 * - Signature status and capture
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Wind,
  Thermometer,
  Snowflake,
  Users,
  Truck,
  Edit,
  Download,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkLog, useExportWorkLog, type WeatherType } from '../hooks/use-work-logs';
import { SignaturePad } from '@/features/execution/components/SignaturePad';

interface WorkLogDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workLogId: string | null;
  projectId: string;
  onEdit?: () => void;
  onSignContractor?: (signatureUrl: string) => void;
  onSignInspector?: (signatureUrl: string) => void;
}

const weatherIcons: Record<WeatherType, LucideIcon> = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  stormy: CloudLightning,
  snowy: CloudSnow,
  foggy: CloudFog,
  windy: Wind,
  hot: Thermometer,
  cold: Snowflake,
};

function formatDate(dateStr: string, locale: string = 'en'): string {
  return new Date(dateStr).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function WorkLogDetailSheet({
  open,
  onOpenChange,
  workLogId,
  onEdit,
  onSignContractor,
  onSignInspector,
}: Omit<WorkLogDetailSheetProps, 'projectId'>) {
  const { t, i18n } = useTranslation('workLogs');
  const { data: workLog, isLoading } = useWorkLog(workLogId ?? undefined);
  const exportMutation = useExportWorkLog();
  const [contractorSignOpen, setContractorSignOpen] = useState(false);
  const [inspectorSignOpen, setInspectorSignOpen] = useState(false);

  if (!workLogId) return null;

  const canEdit = workLog && !workLog.contractorSignedAt && !workLog.inspectorSignedAt;
  const canSignContractor = workLog && !workLog.contractorSignedAt;
  const canSignInspector = workLog && workLog.contractorSignedAt && !workLog.inspectorSignedAt;

  const WeatherIcon = workLog?.weatherType ? weatherIcons[workLog.weatherType] : Cloud;

  const totalWorkerHours = workLog?.resources.reduce((sum, r) => sum + r.count * r.hours, 0) || 0;
  const totalEquipmentHours =
    workLog?.equipment.reduce((sum, e) => sum + e.count * e.hours, 0) || 0;

  const handleExport = async () => {
    if (!workLog) return;
    await exportMutation.mutateAsync({
      workLogId: workLog.id,
      logDate: workLog.logDate.split('T')[0],
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : !workLog ? (
          <div className="text-center text-neutral-500 py-12">{t('common:notFound')}</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>
                {t('log.title', { date: formatDate(workLog.logDate, i18n.language) })}
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              {/* Weather Section */}
              {workLog.weatherType && (
                <div className="bg-neutral-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-neutral-500 mb-2">
                    {t('weather.title')}
                  </h4>
                  <div className="flex items-center gap-3">
                    <WeatherIcon className="h-8 w-8 text-amber-500" />
                    <div>
                      <p className="font-medium">{t(`weather.${workLog.weatherType}`)}</p>
                      {workLog.weatherTempCelsius !== null && (
                        <p className="text-sm text-neutral-500 flex items-center gap-1">
                          <Thermometer className="h-4 w-4" />
                          {workLog.weatherTempCelsius}
                          {t('weather.celsius')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Resources Section */}
              {workLog.resources.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <h4 className="font-medium">{t('resources.title')}</h4>
                    <Badge variant="secondary" className="ms-auto">
                      {totalWorkerHours}h {t('resources.total')}
                    </Badge>
                  </div>
                  <div className="bg-neutral-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-100">
                        <tr>
                          <th className="text-start px-3 py-2">{t('resources.trade')}</th>
                          <th className="text-center px-3 py-2">{t('resources.count')}</th>
                          <th className="text-center px-3 py-2">{t('resources.hours')}</th>
                          <th className="text-end px-3 py-2">{t('resources.total')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workLog.resources.map((resource, index) => (
                          <tr key={index} className="border-t border-neutral-200">
                            <td className="px-3 py-2">{resource.trade}</td>
                            <td className="text-center px-3 py-2">{resource.count}</td>
                            <td className="text-center px-3 py-2">{resource.hours}</td>
                            <td className="text-end px-3 py-2 font-mono">
                              {resource.count * resource.hours}h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Equipment Section */}
              {workLog.equipment.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="h-4 w-4 text-orange-500" />
                    <h4 className="font-medium">{t('equipment.title')}</h4>
                    <Badge variant="secondary" className="ms-auto">
                      {totalEquipmentHours}h
                    </Badge>
                  </div>
                  <div className="bg-neutral-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-100">
                        <tr>
                          <th className="text-start px-3 py-2">{t('equipment.name')}</th>
                          <th className="text-center px-3 py-2">{t('equipment.count')}</th>
                          <th className="text-center px-3 py-2">{t('equipment.hours')}</th>
                          <th className="text-end px-3 py-2">{t('resources.total')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workLog.equipment.map((eq, index) => (
                          <tr key={index} className="border-t border-neutral-200">
                            <td className="px-3 py-2">{eq.name}</td>
                            <td className="text-center px-3 py-2">{eq.count}</td>
                            <td className="text-center px-3 py-2">{eq.hours}</td>
                            <td className="text-end px-3 py-2 font-mono">{eq.count * eq.hours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Activities */}
              {workLog.activities && (
                <div>
                  <h4 className="font-medium mb-2">{t('log.activities')}</h4>
                  <p className="text-sm text-neutral-600 bg-neutral-50 rounded-lg p-3 whitespace-pre-wrap">
                    {workLog.activities}
                  </p>
                </div>
              )}

              {/* Issues */}
              {workLog.issues && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <h4 className="font-medium text-red-600">{t('log.issues')}</h4>
                  </div>
                  <p className="text-sm bg-red-50 text-red-700 rounded-lg p-3 whitespace-pre-wrap">
                    {workLog.issues}
                  </p>
                </div>
              )}

              {/* Safety Notes */}
              {workLog.safetyNotes && (
                <div>
                  <h4 className="font-medium mb-2">{t('log.safety')}</h4>
                  <p className="text-sm text-neutral-600 bg-amber-50 rounded-lg p-3 whitespace-pre-wrap">
                    {workLog.safetyNotes}
                  </p>
                </div>
              )}

              {/* Signatures Section */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('signatures.title')}</h4>
                <div className="grid gap-4">
                  {/* Contractor Signature */}
                  <div className="bg-neutral-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{t('signatures.contractor')}</p>
                      {workLog.contractorSignedAt ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 me-1" />
                          {t('signatures.sign')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-neutral-500">
                          <Clock className="h-3 w-3 me-1" />
                          {t('signatures.pending')}
                        </Badge>
                      )}
                    </div>
                    {workLog.contractorSignatureUrl ? (
                      <img
                        src={workLog.contractorSignatureUrl}
                        alt="Contractor signature"
                        className="h-16 bg-white rounded border"
                        loading="lazy"
                      />
                    ) : canSignContractor && onSignContractor ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setContractorSignOpen(true)}
                        >
                          {t('signatures.sign')}
                        </Button>
                        <SignaturePad
                          open={contractorSignOpen}
                          onOpenChange={setContractorSignOpen}
                          onSave={onSignContractor}
                          title={t('signatures.contractor')}
                        />
                      </>
                    ) : null}
                  </div>

                  {/* Inspector Signature */}
                  <div className="bg-neutral-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{t('signatures.inspector')}</p>
                      {workLog.inspectorSignedAt ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 me-1" />
                          {t('signatures.sign')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-neutral-500">
                          <Clock className="h-3 w-3 me-1" />
                          {t('signatures.pending')}
                        </Badge>
                      )}
                    </div>
                    {workLog.inspectorSignatureUrl ? (
                      <img
                        src={workLog.inspectorSignatureUrl}
                        alt="Inspector signature"
                        className="h-16 bg-white rounded border"
                        loading="lazy"
                      />
                    ) : canSignInspector && onSignInspector ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setInspectorSignOpen(true)}
                        >
                          {t('signatures.sign')}
                        </Button>
                        <SignaturePad
                          open={inspectorSignOpen}
                          onOpenChange={setInspectorSignOpen}
                          onSave={onSignInspector}
                          title={t('signatures.inspector')}
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="mt-6 flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleExport} disabled={exportMutation.isPending}>
                {exportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 me-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 me-1" />
                )}
                {t('actions.export')}
              </Button>
              <div className="flex-1" />
              {canEdit && onEdit && (
                <Button variant="outline" onClick={onEdit}>
                  <Edit className="h-4 w-4 me-1" />
                  {t('actions.edit')}
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
