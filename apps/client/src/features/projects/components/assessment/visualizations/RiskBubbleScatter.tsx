/**
 * Risk Bubble Scatter Plot
 *
 * Plots risks on a Likelihood (x) × Impact (y) plane.
 * Bubble size = number of affected domains. Color = category.
 * Top-right quadrant = critical attention area.
 */
import type { AssessmentRisk, RiskCategory } from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Category colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<RiskCategory, { fill: string; stroke: string; label: string }> = {
  technical: { fill: '#3b82f6', stroke: '#2563eb', label: 'Technical' },
  business: { fill: '#8b5cf6', stroke: '#7c3aed', label: 'Business' },
  timeline: { fill: '#f59e0b', stroke: '#d97706', label: 'Timeline' },
  organizational: { fill: '#64748b', stroke: '#475569', label: 'Organizational' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RiskBubbleScatterProps {
  risks: AssessmentRisk[];
  t: (key: string) => string;
}

export default function RiskBubbleScatter({ risks, t }: RiskBubbleScatterProps) {
  // Add slight jitter to prevent exact overlaps
  const jitter = (val: number, i: number) => val + (((i * 7) % 5) - 2) * 0.06;

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="risk-bubble-scatter">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {t('assessment.riskRegister.heatMap')}
        </h3>
        <div className="flex items-center gap-3 text-xs">
          {Object.entries(CATEGORY_COLORS).map(([key, { fill }]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fill }} />
              {t(`assessment.riskRegister.categories.${key}`)}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full" style={{ minHeight: 280 }} role="img" aria-label="Risk likelihood vs impact scatter plot">
        {/* Background quadrants */}
        <rect x={10} y={5} width={42} height={42} fill="#f0fdf4" rx={2} /> {/* Low risk */}
        <rect x={52} y={5} width={42} height={42} fill="#fef3c7" rx={2} /> {/* Medium-high */}
        <rect x={10} y={47} width={42} height={42} fill="#f0fdf4" rx={2} /> {/* Low-low */}
        <rect x={52} y={47} width={42} height={42} fill="#fef9c3" rx={2} /> {/* Medium-low */}

        {/* Critical zone highlight */}
        <rect x={52} y={5} width={42} height={42} fill="#fef2f2" fillOpacity={0.5} rx={2} />
        <text x={93} y={10} fontSize={2} fill="#ef4444" fontWeight={600} textAnchor="end">Critical Zone</text>

        {/* Axis labels */}
        <text x={50} y={98} fontSize={2.5} fill="#64748b" textAnchor="middle" fontWeight={500}>
          {t('assessment.riskRegister.likelihood')} →
        </text>
        <text x={3} y={50} fontSize={2.5} fill="#64748b" textAnchor="middle" fontWeight={500} transform="rotate(-90, 3, 50)">
          {t('assessment.riskRegister.impact')} →
        </text>

        {/* Grid lines */}
        {[1, 2, 3, 4, 5].map((i) => {
          const x = 10 + ((i - 0.5) / 5) * 84;
          const y = 89 - ((i - 0.5) / 5) * 84;
          return (
            <g key={`grid-${i}`}>
              <line x1={x} y1={5} x2={x} y2={89} stroke="#e2e8f0" strokeWidth={0.15} />
              <line x1={10} y1={y} x2={94} y2={y} stroke="#e2e8f0" strokeWidth={0.15} />
              <text x={x} y={93} fontSize={1.8} fill="#94a3b8" textAnchor="middle">{i}</text>
              <text x={8} y={y + 0.7} fontSize={1.8} fill="#94a3b8" textAnchor="end">{i}</text>
            </g>
          );
        })}

        {/* Bubbles */}
        {risks.map((risk, i) => {
          const { fill, stroke } = CATEGORY_COLORS[risk.category];
          const x = 10 + (jitter(risk.likelihood, i) / 5) * 84;
          const y = 89 - (jitter(risk.impact, i) / 5) * 84;
          const r = 1.5 + risk.affectedDomains.length * 0.8;

          return (
            <g key={risk.id}>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={fill}
                fillOpacity={0.25}
                stroke={stroke}
                strokeWidth={0.3}
              />
              <circle
                cx={x}
                cy={y}
                r={r * 0.4}
                fill={fill}
                fillOpacity={0.8}
              />
              <title>{risk.description}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
