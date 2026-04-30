/**
 * Executive Summary Card
 *
 * The first thing a VP sees. 3-sentence narrative summarizing
 * the assessment: scope, readiness breakdown, and critical blockers.
 * Answers "what is the bottom line?" in 10 seconds.
 */
import type { AssessmentData } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function getReadinessLevel(autoPercent: number): {
  label: string;
  color: string;
  textColor: string;
} {
  if (autoPercent >= 60)
    return { label: 'High', color: 'bg-emerald-100', textColor: 'text-emerald-800' };
  if (autoPercent >= 35)
    return { label: 'Moderate', color: 'bg-amber-100', textColor: 'text-amber-800' };
  return { label: 'Low', color: 'bg-red-100', textColor: 'text-red-800' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExecutiveSummaryProps {
  assessment: AssessmentData;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function ExecutiveSummary({ assessment, t }: ExecutiveSummaryProps) {
  const { totalItems, totalAuto, totalGuided, totalManual, totalBlocked } = assessment;
  const domainCount = assessment.domains.length;
  const autoPercent = totalItems > 0 ? Math.round((totalAuto / totalItems) * 100) : 0;
  const guidedPercent = totalItems > 0 ? Math.round((totalGuided / totalItems) * 100) : 0;
  const manualPercent = totalItems > 0 ? Math.round((totalManual / totalItems) * 100) : 0;

  const criticalRisks = assessment.risks.filter((r) => r.severity === 'critical');
  const readiness = getReadinessLevel(autoPercent);

  // Build the narrative
  const criticalSummaries = criticalRisks.slice(0, 3).map((r) => {
    // Extract the key phrase from the description (first part before " — ")
    const phrase = r.description.split(' — ')[0].split(' — ')[0];
    return phrase.length > 60 ? phrase.slice(0, 57) + '...' : phrase;
  });

  return (
    <section
      className="bg-linear-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white"
      data-testid="executive-summary"
    >
      {/* Top row: title + readiness badge */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Executive Summary</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            {t('assessment.header.runInfo', {
              number: assessment.runs[assessment.currentRunIndex].number,
              timeAgo: 'latest',
            })}
          </p>
        </div>
        <div
          className={`${readiness.color} ${readiness.textColor} px-3 py-1 rounded-full text-xs font-semibold`}
        >
          Migration Readiness: {readiness.label}
        </div>
      </div>

      {/* Narrative paragraph */}
      <div className="space-y-3 mb-5" data-testid="executive-narrative">
        <p className="text-[15px] text-slate-200 leading-relaxed">
          Your Salesforce CPQ org contains{' '}
          <span className="text-white font-semibold">
            {formatNumber(totalItems)} configuration items
          </span>{' '}
          across {domainCount} domains.{' '}
          <span className="text-emerald-400 font-semibold">{autoPercent}%</span> can be
          auto-migrated, <span className="text-amber-400 font-semibold">{guidedPercent}%</span> need
          guided setup, <span className="text-red-400 font-semibold">{manualPercent}%</span> require
          custom development, and <span className="text-red-300 font-semibold">{totalBlocked}</span>{' '}
          items are blocked with no RCA equivalent.
        </p>

        {criticalRisks.length > 0 && (
          <p className="text-sm text-slate-200 leading-relaxed">
            <span className="text-red-400 font-semibold">
              {criticalRisks.length} critical blocker{criticalRisks.length > 1 ? 's' : ''}
            </span>{' '}
            must be resolved before migration can proceed:{' '}
            {criticalSummaries.map((summary, i) => (
              <span key={i}>
                {i > 0 && (i === criticalSummaries.length - 1 ? ', and ' : ', ')}
                <span className="text-white">{summary}</span>
              </span>
            ))}
            .
          </p>
        )}

        {assessment.orgHealth.rcaLicenseCount === 0 && (
          <p className="text-sm text-red-300 leading-relaxed">
            ⚠ RCA licenses are not detected in your org — deployment cannot begin until licenses are
            procured and assigned.
          </p>
        )}
      </div>

      {/* Complexity Score + Hotspots Row */}
      {assessment.complexityScores && (
        <div className="flex flex-col sm:flex-row gap-4 mb-5">
          {/* Complexity gauge */}
          <div className="bg-white/5 rounded-xl px-5 py-4 border border-white/10 flex items-center gap-4 min-w-50">
            <div className="relative w-16 h-16 shrink-0">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={
                    assessment.complexityScores.overall <= 33
                      ? '#10b981'
                      : assessment.complexityScores.overall <= 66
                        ? '#f59e0b'
                        : '#ef4444'
                  }
                  strokeWidth="10"
                  strokeDasharray={`${assessment.complexityScores.overall * 2.51} 251`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold tabular-nums">
                  {assessment.complexityScores.overall}
                </span>
                <span className="text-[8px] text-slate-400">/100</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300">Overall Complexity</p>
              <p
                className={`text-sm font-bold ${assessment.complexityScores.overall <= 33 ? 'text-emerald-400' : assessment.complexityScores.overall <= 66 ? 'text-amber-400' : 'text-red-400'}`}
              >
                {assessment.complexityScores.overall <= 33
                  ? 'Low'
                  : assessment.complexityScores.overall <= 66
                    ? 'Moderate'
                    : 'High'}
              </p>
            </div>
          </div>

          {/* Dimension bars */}
          <div className="flex-1 bg-white/5 rounded-xl px-5 py-3 border border-white/10">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
              Complexity Dimensions
            </p>
            <div className="space-y-1.5">
              {[
                { label: 'Configuration', score: assessment.complexityScores.configurationDepth },
                { label: 'Pricing Logic', score: assessment.complexityScores.pricingLogic },
                { label: 'Customization', score: assessment.complexityScores.customizationLevel },
                { label: 'Data & Usage', score: assessment.complexityScores.dataVolumeUsage },
                { label: 'Tech Debt', score: assessment.complexityScores.technicalDebt },
              ].map((dim) => (
                <div key={dim.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-24 truncate">{dim.label}</span>
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${dim.score <= 33 ? 'bg-emerald-400' : dim.score <= 66 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-300 tabular-nums w-8 text-end">
                    {dim.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Hotspots */}
          {(assessment.complexityHotspots?.length ?? 0) > 0 && (
            <div className="bg-white/5 rounded-xl px-5 py-3 border border-white/10 min-w-55">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Complexity Hotspots
              </p>
              <div className="space-y-1.5">
                {assessment.complexityHotspots!.slice(0, 5).map((hs, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${hs.severity === 'Critical' ? 'bg-red-500' : 'bg-amber-500'}`}
                    />
                    <span className="text-[11px] text-slate-300 truncate flex-1">{hs.name}</span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${hs.severity === 'Critical' ? 'bg-red-900/50 text-red-300' : 'bg-amber-900/50 text-amber-300'}`}
                    >
                      {hs.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom row: key metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="executive-metrics">
        <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/10">
          <p className="text-xl font-bold tabular-nums">{formatNumber(totalItems)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Total Items</p>
        </div>
        <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/10">
          <p className="text-xl font-bold tabular-nums">{domainCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Domains Scanned</p>
        </div>
        <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/10">
          <p className="text-xl font-bold tabular-nums text-red-400">{criticalRisks.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Critical Blockers</p>
        </div>
        <div className="bg-white/5 rounded-xl px-4 py-3 text-center border border-white/10">
          <p className="text-xl font-bold tabular-nums">
            {assessment.orgHealth.rcaLicenseCount > 0 ? (
              <span className="text-emerald-400">Ready</span>
            ) : (
              <span className="text-red-400">Blocked</span>
            )}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">RCA License Status</p>
        </div>
      </div>
    </section>
  );
}
