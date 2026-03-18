/**
 * Work Log Card Component
 *
 * Displays a single work log entry with:
 * - Date and weather info
 * - Resource/equipment summary
 * - Signature status
 */
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
  CheckCircle,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { WorkLog, WeatherType } from '../hooks/use-work-logs';

interface WorkLogCardProps {
  workLog: WorkLog;
  onClick?: (workLog: WorkLog) => void;
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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function WorkLogCard({ workLog, onClick }: WorkLogCardProps) {
  const { t, i18n } = useTranslation('workLogs');

  const WeatherIcon = workLog.weatherType ? weatherIcons[workLog.weatherType] : Cloud;

  const totalWorkers = workLog.resources.reduce((sum, r) => sum + r.count, 0);
  const totalWorkerHours = workLog.resources.reduce((sum, r) => sum + r.count * r.hours, 0);
  const totalEquipment = workLog.equipment.reduce((sum, e) => sum + e.count, 0);
  const totalEquipmentHours = workLog.equipment.reduce((sum, e) => sum + e.count * e.hours, 0);

  const isFullySigned = workLog.contractorSignedAt && workLog.inspectorSignedAt;
  const isPartiallySigned = workLog.contractorSignedAt || workLog.inspectorSignedAt;

  return (
    <div
      className="bg-white rounded shadow-sm p-4 hover:border-emerald-300 hover:shadow-sm transition-all cursor-pointer"
      onClick={() => onClick?.(workLog)}
    >
      {/* Header: Date and Weather */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold">{formatDate(workLog.logDate, i18n.language)}</p>
          {workLog.weatherType && (
            <div className="flex items-center gap-1 text-sm text-neutral-500 mt-1">
              <WeatherIcon className="h-4 w-4" />
              <span>{t(`weather.${workLog.weatherType}`)}</span>
              {workLog.weatherTempCelsius !== null && (
                <>
                  <Thermometer className="h-3 w-3 ms-1" />
                  <span>
                    {workLog.weatherTempCelsius}
                    {t('weather.celsius')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Signature Status Badge */}
        {isFullySigned ? (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 me-1" />
            {t('signatures.title')}
          </Badge>
        ) : isPartiallySigned ? (
          <Badge className="bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3 me-1" />
            {t('signatures.pending')}
          </Badge>
        ) : null}
      </div>

      {/* Resources Summary */}
      <div className="flex flex-wrap gap-4 text-sm">
        {totalWorkers > 0 && (
          <div className="flex items-center gap-1 text-neutral-600">
            <Users className="h-4 w-4 text-blue-500" />
            <span>
              {totalWorkers} {t('resources.count')} • {totalWorkerHours}h
            </span>
          </div>
        )}

        {totalEquipment > 0 && (
          <div className="flex items-center gap-1 text-neutral-600">
            <Truck className="h-4 w-4 text-orange-500" />
            <span>
              {totalEquipment} {t('equipment.title')} • {totalEquipmentHours}h
            </span>
          </div>
        )}
      </div>

      {/* Activities Preview */}
      {workLog.activities && (
        <p className="text-sm text-neutral-500 mt-2 line-clamp-2">{workLog.activities}</p>
      )}

      {/* Issues Indicator */}
      {workLog.issues && (
        <div className="mt-2">
          <Badge variant="outline" className="text-red-600 border-red-200 text-xs">
            {t('log.issues')}
          </Badge>
        </div>
      )}
    </div>
  );
}
