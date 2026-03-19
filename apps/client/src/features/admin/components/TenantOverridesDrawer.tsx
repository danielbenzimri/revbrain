import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Shield, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantOverrides, useGrantOverride, useRevokeOverride } from '../hooks';
import { WORK_MODULES } from './PlanEditorDrawer';

const LIMIT_FEATURES = ['maxUsers', 'maxProjects', 'storageGB'] as const;
type LimitFeature = (typeof LIMIT_FEATURES)[number];

const ALL_FEATURES = [...WORK_MODULES, ...LIMIT_FEATURES];

function isLimitFeature(feature: string): feature is LimitFeature {
  return (LIMIT_FEATURES as readonly string[]).includes(feature);
}

interface TenantOverridesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  orgName: string;
}

export function TenantOverridesDrawer({
  open,
  onOpenChange,
  orgId,
  orgName,
}: TenantOverridesDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const { data: overrides = [], isLoading } = useTenantOverrides(orgId);
  const grantMutation = useGrantOverride();
  const revokeMutation = useRevokeOverride();

  // Form state
  const [feature, setFeature] = useState<string>(ALL_FEATURES[0]);
  const [boolValue, setBoolValue] = useState(true);
  const [numberValue, setNumberValue] = useState(0);
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const activeOverrides = overrides.filter((o) => !o.revokedAt);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    if (!reason.trim()) {
      setFormError(t('admin.overrides.reasonRequired'));
      return;
    }

    setFormError(null);

    try {
      await grantMutation.mutateAsync({
        orgId,
        feature,
        value: isLimitFeature(feature) ? numberValue : boolValue,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        reason: reason.trim(),
      });

      // Reset form
      setFeature(ALL_FEATURES[0]);
      setBoolValue(true);
      setNumberValue(0);
      setExpiresAt('');
      setReason('');
    } catch {
      // Error handled by mutation state
    }
  };

  const handleRevoke = async (id: string) => {
    if (!orgId) return;
    if (!confirm(t('admin.overrides.revokeConfirm'))) return;
    revokeMutation.mutate({ id, orgId });
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const getFeatureLabel = (feat: string) => {
    // For work modules, use the localized module name
    if ((WORK_MODULES as readonly string[]).includes(feat)) {
      return t(`admin.pricing.planEditor.modules.${feat}`, feat);
    }
    // For limit features, use the plan editor labels
    return t(`admin.pricing.planEditor.${feat}`, feat);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-lg p-0 flex flex-col"
        hideCloseButton
      >
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center">
              <h2 className="text-xl font-bold">
                {t('admin.overrides.title')} — {orgName}
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">{t('admin.overrides.subtitle')}</p>
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Active Overrides List */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                {t('admin.overrides.title')}
              </h3>

              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : activeOverrides.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <Shield className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">{t('admin.overrides.noOverrides')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeOverrides.map((override) => (
                    <div
                      key={override.id}
                      className="bg-white border border-slate-200 rounded-lg p-4 flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-slate-900">
                            {getFeatureLabel(override.feature)}
                          </span>
                          <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full font-medium">
                            {String(override.value)}
                          </span>
                        </div>
                        {override.reason && (
                          <p className="text-xs text-slate-500 mb-1">{override.reason}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>
                            {t('admin.overrides.grantedAt')}:{' '}
                            {formatDistanceToNow(new Date(override.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                          <span>
                            {t('admin.overrides.expiresAt')}:{' '}
                            {override.expiresAt
                              ? formatDistanceToNow(new Date(override.expiresAt), {
                                  addSuffix: true,
                                })
                              : t('admin.overrides.permanent')}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                        onClick={() => handleRevoke(override.id)}
                        disabled={revokeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="border-t border-slate-200" />

            {/* Grant Form */}
            <form onSubmit={handleGrant} className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">{t('admin.overrides.grant')}</h3>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              {/* Feature */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.overrides.feature')}
                </label>
                <select
                  value={feature}
                  onChange={(e) => setFeature(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm bg-white"
                >
                  <optgroup label={t('admin.pricing.planEditor.workModules')}>
                    {WORK_MODULES.map((mod) => (
                      <option key={mod} value={mod}>
                        {t(`admin.pricing.planEditor.modules.${mod}`, mod)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t('admin.pricing.planEditor.limits')}>
                    {LIMIT_FEATURES.map((lim) => (
                      <option key={lim} value={lim}>
                        {t(`admin.pricing.planEditor.${lim}`, lim)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Value */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.overrides.value')}
                </label>
                {isLimitFeature(feature) ? (
                  <input
                    type="number"
                    value={numberValue}
                    onChange={(e) => setNumberValue(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
                  />
                ) : (
                  <select
                    value={boolValue ? 'true' : 'false'}
                    onChange={(e) => setBoolValue(e.target.value === 'true')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm bg-white"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                )}
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.overrides.expiresAt')}{' '}
                  <span className="text-slate-400 font-normal">
                    ({t('admin.overrides.permanent')})
                  </span>
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('admin.overrides.reason')} *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={grantMutation.isPending}
                className="w-full bg-violet-600 hover:bg-violet-700"
              >
                {grantMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {t('common.saving', 'Saving...')}
                  </>
                ) : (
                  t('admin.overrides.grant')
                )}
              </Button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
