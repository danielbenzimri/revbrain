/**
 * Risk & Blocker Cards + Key Findings
 *
 * Side-by-side risk/blocker cards with "view all" links,
 * and key findings list with severity icons below.
 */
import type { AssessmentRisk, KeyFinding } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-red-600 bg-red-50',
  high: 'text-red-500 bg-red-50',
  medium: 'text-amber-600 bg-amber-50',
  low: 'text-emerald-600 bg-emerald-50',
};

const FINDING_ICONS: Record<string, { icon: string; color: string }> = {
  success: { icon: '✓', color: 'text-emerald-600 bg-emerald-50' },
  warning: { icon: '!', color: 'text-amber-600 bg-amber-50' },
  error: { icon: '✕', color: 'text-red-600 bg-red-50' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RiskBlockerCardsProps {
  risks: AssessmentRisk[];
  findings: KeyFinding[];
  blockedCount: number;
  onViewAllRisks?: () => void;
  onViewAllBlockers?: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function RiskBlockerCards({
  risks,
  findings,
  blockedCount,
  onViewAllRisks,
  onViewAllBlockers,
  t,
}: RiskBlockerCardsProps) {
  // Top 3 risks by severity
  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const sortedRisks = [...risks].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );
  const topRisks = sortedRisks.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Risk & Blocker cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Risks */}
        <section
          className="bg-white rounded-2xl p-5"
          aria-label={t('assessment.overview.topRisks')}
          data-testid="top-risks-card"
        >
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            {t('assessment.overview.topRisks')}
          </h3>
          <div className="space-y-3">
            {topRisks.map((risk) => (
              <div key={risk.id} className="flex items-start gap-2">
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded ${SEVERITY_STYLES[risk.severity] || ''}`}
                >
                  {t(`assessment.riskRegister.severities.${risk.severity}`)}
                </span>
                <p className="text-sm text-slate-700 leading-snug">{risk.description}</p>
              </div>
            ))}
          </div>
          {risks.length > 3 && (
            <button
              onClick={onViewAllRisks}
              className="mt-3 text-sm text-violet-600 hover:text-violet-700 font-medium"
            >
              {t('assessment.overview.viewAllRisks', { count: risks.length })} →
            </button>
          )}
        </section>

        {/* Blockers */}
        <section
          className="bg-red-50/70 rounded-2xl p-5 border border-red-200"
          aria-label={t('assessment.overview.blockers')}
          data-testid="blockers-card"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold">!</span>
            <h3 className="text-sm font-semibold text-red-800">
              {t('assessment.overview.blockers')}
            </h3>
          </div>
          <div className="space-y-3">
            {sortedRisks
              .filter((r) => r.severity === 'critical')
              .slice(0, 3)
              .map((risk) => (
                <div key={risk.id} className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 shrink-0">🚫</span>
                  <p className="text-sm text-red-900 leading-snug">{risk.description}</p>
                </div>
              ))}
            {blockedCount > 0 && (
              <p className="text-sm text-slate-500">
                {blockedCount} {t('assessment.migrationStatus.blocked').toLowerCase()} items across domains
              </p>
            )}
          </div>
          {blockedCount > 0 && (
            <button
              onClick={onViewAllBlockers}
              className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
            >
              {t('assessment.overview.viewAllBlockers', { count: blockedCount })} →
            </button>
          )}
        </section>
      </div>

      {/* Key Findings — only shown when findings provided */}
      {findings.length > 0 && (
        <section aria-label={t('assessment.overview.keyFindings')} data-testid="key-findings">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t('assessment.overview.keyFindings')}
          </h2>
          <div className="bg-white rounded-2xl p-5 space-y-2.5">
            {findings.map((finding) => {
              const { icon, color } = FINDING_ICONS[finding.severity] || FINDING_ICONS.warning;
              return (
                <div key={finding.id} className="flex items-start gap-3">
                  <span
                    className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-xs font-bold shrink-0 mt-0.5`}
                  >
                    {icon}
                  </span>
                  <p className="text-sm text-slate-700">{t(finding.text)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
