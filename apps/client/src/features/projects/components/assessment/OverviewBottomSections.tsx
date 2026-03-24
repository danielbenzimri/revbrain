/**
 * Overview Bottom Sections
 *
 * Readiness Prerequisites, Migration Strategy Summary,
 * and Assessment Completeness checklist.
 */
import type { OrgHealth, CompletenessItem } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

interface PrerequisitesProps {
  orgHealth: OrgHealth;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function Prerequisites({ orgHealth, t }: PrerequisitesProps) {
  const items = [
    {
      ok: true,
      text: t('assessment.prerequisites.edition', { edition: orgHealth.edition }),
    },
    {
      ok: orgHealth.rcaLicenseCount > 0,
      text: orgHealth.rcaLicenseCount > 0
        ? t('assessment.prerequisites.rcaDetected', { count: orgHealth.rcaLicenseCount })
        : t('assessment.prerequisites.rcaNotDetected'),
    },
    {
      ok: orgHealth.apiUsagePercent < 80 && orgHealth.storageUsagePercent < 80,
      text: t('assessment.prerequisites.orgHealth', {
        api: orgHealth.apiUsagePercent,
        storage: orgHealth.storageUsagePercent,
        apex: orgHealth.apexGovernorPercent,
      }),
    },
    {
      ok: !orgHealth.hasSalesforceBilling,
      text: orgHealth.hasSalesforceBilling
        ? t('assessment.prerequisites.billingDetected')
        : t('assessment.prerequisites.billingNotDetected'),
    },
    {
      ok: orgHealth.apexGovernorPercent < 70,
      text: orgHealth.apexGovernorPercent < 70
        ? t('assessment.prerequisites.governorLimits')
        : t('assessment.prerequisites.governorLimitsWarning'),
    },
  ];

  return (
    <section aria-label={t('assessment.overview.prerequisites')} data-testid="prerequisites">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {t('assessment.overview.prerequisites')}
      </h2>
      <div className="bg-white rounded-2xl p-5 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`text-sm mt-0.5 ${item.ok ? 'text-emerald-500' : 'text-amber-500'}`}>
              {item.ok ? '✓' : '⚠'}
            </span>
            <p className="text-sm text-slate-700">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Migration Strategy
// ---------------------------------------------------------------------------

interface StrategyProps {
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MigrationStrategy({ t }: StrategyProps) {
  const phases = [
    { number: 1, name: 'Core (Products + Pricing)', weeks: '8-12' },
    { number: 2, name: 'Extensions (Rules + Code)', weeks: '6-10' },
    { number: 3, name: 'Integrations + Cutover', weeks: '4-6' },
  ];

  return (
    <section aria-label={t('assessment.overview.migrationStrategy')} data-testid="migration-strategy">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {t('assessment.overview.migrationStrategy')}
      </h2>
      <div className="bg-white rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-slate-900">
            {t('assessment.strategy.recommendedApproach')}:
          </span>
          <span className="text-sm text-violet-600 font-medium">
            {t('assessment.strategy.phased', { count: phases.length })}
          </span>
        </div>

        <div className="space-y-2 mb-4">
          {phases.map((phase) => (
            <div key={phase.number} className="flex items-center gap-3 text-sm">
              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold shrink-0">
                {phase.number}
              </span>
              <span className="text-slate-700 flex-1">{phase.name}</span>
              <span className="text-slate-400 tabular-nums">{phase.weeks} wks</span>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-500 mb-1.5">
            {t('assessment.strategy.keyAssumptions')}:
          </p>
          <ul className="text-xs text-slate-400 space-y-0.5 list-disc list-inside">
            <li>Parallel run period included</li>
            <li>Inactive items excluded from scope</li>
            <li>Dedicated OmniStudio resource available</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Assessment Completeness
// ---------------------------------------------------------------------------

interface CompletenessProps {
  items: CompletenessItem[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function AssessmentCompleteness({ items, t }: CompletenessProps) {
  const completed = items.filter((i) => i.completed).length;
  const total = items.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section aria-label={t('assessment.overview.completeness')} data-testid="completeness">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {t('assessment.overview.completeness')}
      </h2>
      <div className="bg-white rounded-2xl p-5">
        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all"
              style={{ width: `${percent}%` }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="text-sm font-semibold text-slate-900 tabular-nums" data-testid="completeness-percent">
            {percent}%
          </span>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5">
              <span className={`text-sm ${item.completed ? 'text-emerald-500' : 'text-slate-300'}`}>
                {item.completed ? '✓' : '○'}
              </span>
              <span className={`text-sm ${item.completed ? 'text-slate-700' : 'text-slate-400'}`}>
                {t(item.labelKey)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Composed Export
// ---------------------------------------------------------------------------

interface OverviewBottomSectionsProps {
  orgHealth: OrgHealth;
  completeness: CompletenessItem[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function OverviewBottomSections({ orgHealth, completeness, t }: OverviewBottomSectionsProps) {
  return (
    <div className="space-y-6">
      <Prerequisites orgHealth={orgHealth} t={t} />
      <MigrationStrategy t={t} />
      <AssessmentCompleteness items={completeness} t={t} />
    </div>
  );
}
