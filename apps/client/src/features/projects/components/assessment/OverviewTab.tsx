/**
 * Overview Tab — Executive Command Center
 *
 * Top section: 4 migration readiness stat cards + stacked bar
 * Bottom section: complexity heatmap by domain (9 rows)
 */
import type { AssessmentData, DomainId } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Migration Readiness Cards
// ---------------------------------------------------------------------------

const STATUS_CONFIG = [
  { key: 'auto' as const, colorDot: 'bg-emerald-500', colorBar: 'bg-emerald-500' },
  { key: 'guided' as const, colorDot: 'bg-amber-500', colorBar: 'bg-amber-500' },
  { key: 'manual' as const, colorDot: 'bg-red-500', colorBar: 'bg-red-500' },
  { key: 'blocked' as const, colorDot: 'bg-slate-800', colorBar: 'bg-slate-800' },
] as const;

interface OverviewTabProps {
  assessment: AssessmentData;
  onDomainClick: (domainId: DomainId) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function OverviewTab({ assessment, onDomainClick, t }: OverviewTabProps) {
  const total = assessment.totalItems;

  return (
    <div className="space-y-6">
      {/* Migration Readiness */}
      <section aria-label={t('assessment.overview.migrationReadiness')}>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('assessment.overview.migrationReadiness')}
        </h2>

        {/* Stacked bar */}
        <div className="bg-white rounded-2xl p-6">
          <div className="flex items-center gap-0.5 h-3 rounded-full overflow-hidden bg-slate-100 mb-6">
            {STATUS_CONFIG.map(({ key, colorBar }) => {
              const count = assessment[`total${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof AssessmentData] as number;
              if (count <= 0) return null;
              return (
                <div
                  key={key}
                  className={`${colorBar} h-full transition-all`}
                  style={{ width: `${(count / total) * 100}%` }}
                  aria-label={`${t(`assessment.migrationStatus.${key}`)}: ${count}`}
                />
              );
            })}
          </div>

          {/* 4 stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="readiness-cards">
            {STATUS_CONFIG.map(({ key, colorDot }) => {
              const count = assessment[`total${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof AssessmentData] as number;
              const isBlocked = key === 'blocked';
              return (
                <div
                  key={key}
                  className={`text-center p-3 rounded-xl ${isBlocked && count > 0 ? 'bg-red-50 ring-1 ring-red-200' : ''}`}
                >
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className={`h-2.5 w-2.5 rounded-full ${colorDot}`} />
                    <span className="text-sm font-medium text-slate-700">
                      {t(`assessment.migrationStatus.${key}`)}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Complexity by Domain */}
      <section aria-label={t('assessment.overview.complexityByDomain')}>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {t('assessment.overview.complexityByDomain')}
        </h2>

        <div className="bg-white rounded-2xl divide-y divide-slate-100" data-testid="domain-heatmap">
          {assessment.domains.map((domain) => {
            const complexityColor =
              domain.complexity === 'high'
                ? 'text-red-600 bg-red-50'
                : domain.complexity === 'moderate'
                  ? 'text-amber-600 bg-amber-50'
                  : 'text-emerald-600 bg-emerald-50';

            const barWidth =
              domain.complexity === 'high' ? '80%'
                : domain.complexity === 'moderate' ? '50%'
                  : '25%';

            const barColor =
              domain.complexity === 'high'
                ? 'bg-red-400'
                : domain.complexity === 'moderate'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400';

            const hasBlockers = domain.stats.blocked > 0;

            return (
              <button
                key={domain.id}
                onClick={() => onDomainClick(domain.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-start"
                aria-label={`${t(`assessment.tabs.${domain.id}`)}: ${t(`assessment.complexity.${domain.complexity}`)}, ${domain.stats.total} ${t('assessment.table.items')}`}
              >
                {/* Domain name */}
                <span className="text-sm font-medium text-slate-900 w-32 truncate">
                  {t(`assessment.tabs.${domain.id}`)}
                </span>

                {/* Complexity bar */}
                <div className="flex-1 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`${barColor} h-full rounded-full transition-all`}
                      style={{ width: barWidth }}
                    />
                  </div>
                </div>

                {/* Complexity label */}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${complexityColor}`}>
                  {t(`assessment.complexity.${domain.complexity}`)}
                </span>

                {/* Item count */}
                <span className="text-sm text-slate-500 w-20 text-end tabular-nums">
                  {domain.stats.total} {t('assessment.table.items')}
                </span>

                {/* Warning icon for blockers */}
                {hasBlockers && (
                  <span className="text-red-500 text-sm" aria-label="has blockers">⚠</span>
                )}

                {/* Arrow */}
                <span className="text-slate-300">→</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
