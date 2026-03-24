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

function getReadinessLevel(autoPercent: number): { label: string; color: string; textColor: string } {
  if (autoPercent >= 60) return { label: 'High', color: 'bg-emerald-100', textColor: 'text-emerald-800' };
  if (autoPercent >= 35) return { label: 'Moderate', color: 'bg-amber-100', textColor: 'text-amber-800' };
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
  const manualPercent = totalItems > 0 ? Math.round(((totalManual + totalBlocked) / totalItems) * 100) : 0;

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
        <div className={`${readiness.color} ${readiness.textColor} px-3 py-1 rounded-full text-xs font-semibold`}>
          Migration Readiness: {readiness.label}
        </div>
      </div>

      {/* Narrative paragraph */}
      <div className="space-y-3 mb-5" data-testid="executive-narrative">
        <p className="text-sm text-slate-200 leading-relaxed">
          Your Salesforce CPQ org contains <span className="text-white font-semibold">{formatNumber(totalItems)} configuration items</span> across {domainCount} domains.{' '}
          <span className="text-emerald-400 font-medium">{autoPercent}%</span> can be auto-migrated,{' '}
          <span className="text-amber-400 font-medium">{guidedPercent}%</span> need guided setup, and{' '}
          <span className="text-red-400 font-medium">{manualPercent}%</span> require custom development or have no RCA equivalent.
        </p>

        {criticalRisks.length > 0 && (
          <p className="text-sm text-slate-200 leading-relaxed">
            <span className="text-red-400 font-semibold">{criticalRisks.length} critical blocker{criticalRisks.length > 1 ? 's' : ''}</span> must be resolved before migration can proceed:{' '}
            {criticalSummaries.map((summary, i) => (
              <span key={i}>
                {i > 0 && (i === criticalSummaries.length - 1 ? ', and ' : ', ')}
                <span className="text-white">{summary}</span>
              </span>
            ))}.
          </p>
        )}

        {assessment.orgHealth.rcaLicenseCount === 0 && (
          <p className="text-sm text-red-300 leading-relaxed">
            ⚠ RCA licenses are not detected in your org — deployment cannot begin until licenses are procured and assigned.
          </p>
        )}
      </div>

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
            {assessment.orgHealth.rcaLicenseCount > 0
              ? <span className="text-emerald-400">Ready</span>
              : <span className="text-red-400">Blocked</span>}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">RCA License Status</p>
        </div>
      </div>
    </section>
  );
}
