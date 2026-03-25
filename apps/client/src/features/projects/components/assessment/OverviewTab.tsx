/**
 * Overview Tab — Executive Command Center
 *
 * Top section: 4 migration readiness stat cards + stacked bar
 * Bottom section: complexity heatmap by domain (9 rows)
 */
import { useState } from 'react';
import type { AssessmentData, DomainId } from '../../mocks/assessment-mock-data';
import RiskBlockerCards from './RiskBlockerCards';
import OverviewBottomSections from './OverviewBottomSections';
import { DeltaSummary } from './RunDelta';
import RiskRegister from './RiskRegister';
import EffortEstimation from './EffortEstimation';
import { MigrationTreemap, RiskBubbleScatter, DomainRadar, OrgHealthGauges } from './visualizations';
import ExecutiveSummary from './ExecutiveSummary';

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
  const [showRiskRegister, setShowRiskRegister] = useState(false);
  const [showEffortEstimation, setShowEffortEstimation] = useState(false);
  const total = assessment.totalItems;

  // Show Risk Register as expanded section
  if (showRiskRegister) {
    return (
      <RiskRegister
        risks={assessment.risks}
        onClose={() => setShowRiskRegister(false)}
        t={t}
      />
    );
  }

  // Show Effort Estimation as expanded section
  if (showEffortEstimation) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setShowEffortEstimation(false)}
          className="text-sm text-violet-600 hover:text-violet-700 font-medium"
        >
          ← Back to Overview
        </button>
        <EffortEstimation assessment={assessment} t={t} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ═══════════════════════════════════════════════════════════
          ZONE 1: EXECUTIVE VIEW — "What do I need to know?"
          VP reads this in 30 seconds and has the full picture.
          ═══════════════════════════════════════════════════════════ */}

      {/* Executive Summary — the first thing a VP sees */}
      <ExecutiveSummary assessment={assessment} t={t} />

      {/* Migration Readiness breakdown + Risks side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Readiness: stacked bar + 4 stat cards (takes 2/3 width) */}
        <section aria-label={t('assessment.overview.migrationReadiness')} className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t('assessment.overview.migrationReadiness')}
          </h2>
          <div className="bg-white rounded-2xl p-5">
            <div className="flex items-center gap-0.5 h-3 rounded-full overflow-hidden bg-slate-100 mb-4">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="readiness-cards">
              {STATUS_CONFIG.map(({ key, colorDot }) => {
                const count = assessment[`total${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof AssessmentData] as number;
                const isBlocked = key === 'blocked';
                return (
                  <div
                    key={key}
                    className={`text-center p-3 rounded-xl ${isBlocked && count > 0 ? 'bg-red-50 border border-red-200' : ''}`}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className={`h-2.5 w-2.5 rounded-full ${colorDot}`} />
                      <span className="text-sm font-medium text-slate-700">
                        {t(`assessment.migrationStatus.${key}`)}
                      </span>
                    </div>
                    <p className={`text-2xl font-bold ${isBlocked && count > 0 ? 'text-red-600' : 'text-slate-900'}`}>{count}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Key Findings (takes 1/3 width) */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t('assessment.overview.keyFindings')}
          </h2>
          <div className="bg-white rounded-2xl p-5 space-y-2.5" data-testid="key-findings">
            {assessment.keyFindings.slice(0, 6).map((finding) => {
              const icons = { success: { icon: '✓', cls: 'text-emerald-600 bg-emerald-50' }, warning: { icon: '!', cls: 'text-amber-600 bg-amber-50' }, error: { icon: '✕', cls: 'text-red-600 bg-red-50' } };
              const { icon, cls } = icons[finding.severity] || icons.warning;
              return (
                <div key={finding.id} className="flex items-start gap-2.5">
                  <span className={`w-5 h-5 rounded-full ${cls} flex items-center justify-center text-xs font-bold shrink-0 mt-0.5`}>{icon}</span>
                  <p className="text-xs text-slate-700 leading-relaxed">{t(finding.text)}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Risks + Blockers side by side */}
      <RiskBlockerCards
        risks={assessment.risks}
        findings={[]} /* findings now shown above */
        blockedCount={assessment.totalBlocked}
        onViewAllRisks={() => setShowRiskRegister(true)}
        onViewAllBlockers={() => setShowRiskRegister(true)}
        t={t}
      />

      {/* ═══════════════════════════════════════════════════════════
          ZONE 2: DEEP ANALYSIS — "Let me dig into the details"
          Consultant scrolls here for domain breakdown and charts.
          ═══════════════════════════════════════════════════════════ */}

      {/* Visual divider */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Detailed Analysis</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* Domain heatmap + Treemap side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Domain heatmap rows */}
        <section aria-label={t('assessment.overview.complexityByDomain')}>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t('assessment.overview.complexityByDomain')}
          </h2>
          <div className="bg-white rounded-2xl divide-y divide-slate-100" data-testid="domain-heatmap">
            {assessment.domains.map((domain) => {
              const complexityColor = domain.complexity === 'high' ? 'text-red-600 bg-red-50' : domain.complexity === 'moderate' ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50';
              const barWidth = domain.complexity === 'high' ? '80%' : domain.complexity === 'moderate' ? '50%' : '25%';
              const barColor = domain.complexity === 'high' ? 'bg-red-400' : domain.complexity === 'moderate' ? 'bg-amber-400' : 'bg-emerald-400';
              const hasBlockers = domain.stats.blocked > 0;

              return (
                <button
                  key={domain.id}
                  onClick={() => onDomainClick(domain.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-start"
                  aria-label={`${t(`assessment.tabs.${domain.id}`)}: ${t(`assessment.complexity.${domain.complexity}`)}, ${domain.stats.total} ${t('assessment.table.items')}`}
                >
                  <span className="text-sm font-medium text-slate-900 w-28 truncate">{t(`assessment.tabs.${domain.id}`)}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`${barColor} h-full rounded-full transition-all`} style={{ width: barWidth }} />
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${complexityColor}`}>{t(`assessment.complexity.${domain.complexity}`)}</span>
                  <span className="text-xs text-slate-500 w-16 text-end tabular-nums">{domain.stats.total}</span>
                  {hasBlockers && <span className="text-red-500 text-xs" aria-label="has blockers">⚠</span>}
                  <span className="text-slate-300 text-xs">→</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Treemap */}
        <MigrationTreemap domains={assessment.domains} onDomainClick={onDomainClick} t={t} />
      </div>

      {/* Radar + Risk Scatter */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DomainRadar domains={assessment.domains} t={t} />
        <RiskBubbleScatter risks={assessment.risks} t={t} />
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ZONE 3: OPERATIONAL STATUS — "Where are we in the process?"
          Progress, org health, changes since last run.
          ═══════════════════════════════════════════════════════════ */}

      <div className="flex items-center gap-4 py-2">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Status & Progress</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* Delta + Org Health side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeltaSummary delta={assessment.runDelta} t={t} />
        <OrgHealthGauges orgHealth={assessment.orgHealth} t={t} />
      </div>

      {/* Strategy + Completeness */}
      <OverviewBottomSections
        orgHealth={assessment.orgHealth}
        completeness={assessment.completeness}
        t={t}
      />
    </div>
  );
}
