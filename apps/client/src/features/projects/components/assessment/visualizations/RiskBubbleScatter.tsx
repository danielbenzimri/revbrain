/**
 * Risk Waterfall
 *
 * Horizontal bars for each risk, sized by likelihood × impact score,
 * colored by category. Sorted by severity. Readable descriptions
 * next to each bar — the biggest bars = most attention needed.
 */
import type { AssessmentRisk, RiskCategory } from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<RiskCategory, { bg: string; text: string; label: string }> = {
  technical: { bg: 'bg-blue-400', text: 'text-blue-800', label: 'Technical' },
  business: { bg: 'bg-violet-400', text: 'text-violet-800', label: 'Business' },
  timeline: { bg: 'bg-amber-400', text: 'text-amber-800', label: 'Timeline' },
  organizational: { bg: 'bg-slate-400', text: 'text-slate-700', label: 'Organizational' },
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;
const SEVERITY_LABEL: Record<string, { text: string; cls: string }> = {
  critical: { text: 'Critical', cls: 'text-red-600 bg-red-50' },
  high: { text: 'High', cls: 'text-red-500 bg-red-50' },
  medium: { text: 'Medium', cls: 'text-amber-600 bg-amber-50' },
  low: { text: 'Low', cls: 'text-emerald-600 bg-emerald-50' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RiskBubbleScatterProps {
  risks: AssessmentRisk[];
  t: (key: string) => string;
}

export default function RiskBubbleScatter({ risks, t }: RiskBubbleScatterProps) {
  // Sort by severity then by score descending
  const sorted = [...risks].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return (b.likelihood * b.impact) - (a.likelihood * a.impact);
  });

  // Show top 10 risks to keep it readable
  const topRisks = sorted.slice(0, 10);
  const maxScore = Math.max(...topRisks.map((r) => r.likelihood * r.impact), 1);

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="risk-bubble-scatter">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Top Risks by Severity
        </h3>
        <div className="flex items-center gap-3 text-xs">
          {Object.entries(CATEGORY_STYLES).map(([key, { bg }]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${bg}`} />
              {t(`assessment.riskRegister.categories.${key}`)}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {topRisks.map((risk) => {
          const score = risk.likelihood * risk.impact;
          const width = Math.max((score / maxScore) * 100, 12);
          const { bg } = CATEGORY_STYLES[risk.category];
          const sev = SEVERITY_LABEL[risk.severity] || SEVERITY_LABEL.medium;

          // Truncate description to fit
          const desc = risk.description.split(' — ')[0];
          const shortDesc = desc.length > 65 ? desc.slice(0, 62) + '...' : desc;

          return (
            <div key={risk.id} className="group">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sev.cls}`}>
                  {sev.text}
                </span>
                <p className="text-xs text-slate-700 truncate flex-1" title={risk.description}>
                  {shortDesc}
                </p>
                <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                  {score}/25
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-5 rounded bg-slate-50 overflow-hidden">
                  <div
                    className={`${bg} h-full rounded transition-all group-hover:brightness-110`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                {risk.affectedDomains.length > 0 && (
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {risk.affectedDomains.length} domain{risk.affectedDomains.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {risks.length > 10 && (
        <p className="text-xs text-slate-400 mt-3 text-center">
          Showing top 10 of {risks.length} risks
        </p>
      )}
    </div>
  );
}
