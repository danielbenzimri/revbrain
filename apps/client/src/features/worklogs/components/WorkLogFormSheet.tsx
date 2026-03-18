/**
 * Work Log Form Sheet Component
 *
 * Sheet for creating/editing work logs with:
 * - Date picker
 * - Weather inputs
 * - Resources section (trade, count, hours)
 * - Equipment section (name, count, hours)
 * - Activities, Issues, Safety notes
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Wind,
  Plus,
  Trash2,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  WorkLog,
  CreateWorkLogInput,
  UpdateWorkLogInput,
  WeatherType,
  ResourceEntry,
  EquipmentEntry,
} from '../hooks/use-work-logs';

interface WorkLogFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workLog?: WorkLog | null;
  onSave: (data: CreateWorkLogInput | UpdateWorkLogInput, isEdit: boolean) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const weatherOptions: { type: WeatherType; icon: LucideIcon }[] = [
  { type: 'sunny', icon: Sun },
  { type: 'cloudy', icon: Cloud },
  { type: 'rainy', icon: CloudRain },
  { type: 'stormy', icon: CloudLightning },
  { type: 'snowy', icon: CloudSnow },
  { type: 'foggy', icon: CloudFog },
  { type: 'windy', icon: Wind },
];

const defaultResource: ResourceEntry = { trade: '', count: 1, hours: 8 };
const defaultEquipment: EquipmentEntry = { name: '', count: 1, hours: 8 };

export function WorkLogFormSheet({
  open,
  onOpenChange,
  projectId,
  workLog,
  onSave,
  onDelete,
}: WorkLogFormSheetProps) {
  const { t } = useTranslation('workLogs');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [logDate, setLogDate] = useState('');
  const [weatherType, setWeatherType] = useState<WeatherType | null>(null);
  const [weatherTemp, setWeatherTemp] = useState<number | null>(null);
  const [resources, setResources] = useState<ResourceEntry[]>([]);
  const [equipment, setEquipment] = useState<EquipmentEntry[]>([]);
  const [activities, setActivities] = useState('');
  const [issues, setIssues] = useState('');
  const [safetyNotes, setSafetyNotes] = useState('');

  const isEdit = !!workLog;

  // Reset form when opening/workLog changes
  useEffect(() => {
    if (open) {
      if (workLog) {
        setLogDate(workLog.logDate.split('T')[0]);
        setWeatherType(workLog.weatherType);
        setWeatherTemp(workLog.weatherTempCelsius);
        setResources(workLog.resources.length > 0 ? workLog.resources : [{ ...defaultResource }]);
        setEquipment(workLog.equipment.length > 0 ? workLog.equipment : []);
        setActivities(workLog.activities || '');
        setIssues(workLog.issues || '');
        setSafetyNotes(workLog.safetyNotes || '');
      } else {
        // Default for new log
        const today = new Date().toISOString().split('T')[0];
        setLogDate(today);
        setWeatherType(null);
        setWeatherTemp(null);
        setResources([{ ...defaultResource }]);
        setEquipment([]);
        setActivities('');
        setIssues('');
        setSafetyNotes('');
      }
    }
  }, [open, workLog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validResources = resources.filter((r) => r.trade.trim() !== '');
      const validEquipment = equipment.filter((e) => e.name.trim() !== '');

      if (isEdit) {
        const updateData: UpdateWorkLogInput = {
          logDate,
          weatherType,
          weatherTempCelsius: weatherTemp,
          resources: validResources,
          equipment: validEquipment,
          activities: activities || null,
          issues: issues || null,
          safetyNotes: safetyNotes || null,
        };
        await onSave(updateData, true);
      } else {
        const createData: CreateWorkLogInput = {
          projectId,
          logDate,
          weatherType,
          weatherTempCelsius: weatherTemp,
          resources: validResources,
          equipment: validEquipment,
          activities: activities || null,
          issues: issues || null,
          safetyNotes: safetyNotes || null,
        };
        await onSave(createData, false);
      }

      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!workLog || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(workLog.id);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  };

  // Resource handlers
  const addResource = () => setResources([...resources, { ...defaultResource }]);
  const removeResource = (index: number) => setResources(resources.filter((_, i) => i !== index));
  const updateResource = (index: number, field: keyof ResourceEntry, value: string | number) => {
    const updated = [...resources];
    updated[index] = { ...updated[index], [field]: value };
    setResources(updated);
  };

  // Equipment handlers
  const addEquipment = () => setEquipment([...equipment, { ...defaultEquipment }]);
  const removeEquipment = (index: number) => setEquipment(equipment.filter((_, i) => i !== index));
  const updateEquipment = (index: number, field: keyof EquipmentEntry, value: string | number) => {
    const updated = [...equipment];
    updated[index] = { ...updated[index], [field]: value };
    setEquipment(updated);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('actions.edit') : t('create')}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="logDate">{t('log.date')}</Label>
            <Input
              id="logDate"
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              required
            />
          </div>

          {/* Weather */}
          <div className="space-y-2">
            <Label>{t('weather.title')}</Label>
            <div className="flex flex-wrap gap-2">
              {weatherOptions.map(({ type, icon: Icon }) => (
                <Button
                  key={type}
                  type="button"
                  variant={weatherType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setWeatherType(weatherType === type ? null : type)}
                  className="gap-1"
                >
                  <Icon className="h-4 w-4" />
                  {t(`weather.${type}`)}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Label htmlFor="temp" className="whitespace-nowrap">
                {t('weather.temperature')}
              </Label>
              <Input
                id="temp"
                type="number"
                min={-50}
                max={60}
                value={weatherTemp ?? ''}
                onChange={(e) => setWeatherTemp(e.target.value ? parseInt(e.target.value) : null)}
                className="w-24"
                placeholder="°C"
              />
            </div>
          </div>

          {/* Resources */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('resources.title')}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addResource}>
                <Plus className="h-4 w-4 me-1" />
                {t('resources.add')}
              </Button>
            </div>
            {resources.map((resource, index) => (
              <div key={index} className="flex gap-2 items-start">
                <Input
                  placeholder={t('resources.trade')}
                  value={resource.trade}
                  onChange={(e) => updateResource(index, 'trade', e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  placeholder={t('resources.count')}
                  value={resource.count}
                  onChange={(e) => updateResource(index, 'count', parseInt(e.target.value) || 0)}
                  className="w-20"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder={t('resources.hours')}
                  value={resource.hours}
                  onChange={(e) => updateResource(index, 'hours', parseFloat(e.target.value) || 0)}
                  className="w-20"
                />
                {resources.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeResource(index)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Equipment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('equipment.title')}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addEquipment}>
                <Plus className="h-4 w-4 me-1" />
                {t('equipment.add')}
              </Button>
            </div>
            {equipment.map((eq, index) => (
              <div key={index} className="flex gap-2 items-start">
                <Input
                  placeholder={t('equipment.name')}
                  value={eq.name}
                  onChange={(e) => updateEquipment(index, 'name', e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  placeholder={t('equipment.count')}
                  value={eq.count}
                  onChange={(e) => updateEquipment(index, 'count', parseInt(e.target.value) || 0)}
                  className="w-20"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder={t('equipment.hours')}
                  value={eq.hours}
                  onChange={(e) => updateEquipment(index, 'hours', parseFloat(e.target.value) || 0)}
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEquipment(index)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
            {equipment.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-2">{t('equipment.add')} +</p>
            )}
          </div>

          {/* Activities */}
          <div className="space-y-2">
            <Label htmlFor="activities">{t('log.activities')}</Label>
            <Textarea
              id="activities"
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              rows={3}
              placeholder={t('log.activities')}
            />
          </div>

          {/* Issues */}
          <div className="space-y-2">
            <Label htmlFor="issues">{t('log.issues')}</Label>
            <Textarea
              id="issues"
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              rows={2}
              placeholder={t('log.issues')}
            />
          </div>

          {/* Safety Notes */}
          <div className="space-y-2">
            <Label htmlFor="safetyNotes">{t('log.safety')}</Label>
            <Textarea
              id="safetyNotes"
              value={safetyNotes}
              onChange={(e) => setSafetyNotes(e.target.value)}
              rows={2}
              placeholder={t('log.safety')}
            />
          </div>

          <SheetFooter className="flex-col sm:flex-row gap-2">
            {isEdit && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || loading}
                className="w-full sm:w-auto"
              >
                {deleting && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
                {t('actions.delete')}
              </Button>
            )}
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
              {isEdit ? t('common:save') : t('create')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
