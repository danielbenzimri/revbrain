/**
 * CPQ → RCA Transformation Flow (Sankey-style)
 *
 * Shows flow of objects from CPQ source through migration status
 * to RCA target architecture. Width of each flow = number of items.
 * Pure SVG — no charting library needed.
 */
import { useMemo } from 'react';
import type { AssessmentData } from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Data aggregation
// ---------------------------------------------------------------------------

interface FlowBucket {
  label: string;
  count: number;
  color: string;
  y: number;
  height: number;
}

interface FlowLink {
  sourceY: number;
  sourceHeight: number;
  targetY: number;
  targetHeight: number;
  color: string;
  opacity: number;
}

function buildFlowData(assessment: AssessmentData) {
  // Source buckets (CPQ domains)
  const sources: FlowBucket[] = [];
  // Target buckets (RCA architecture)
  const targetMap = new Map<string, number>();

  // Aggregate RCA targets
  for (const domain of assessment.domains) {
    for (const item of domain.items) {
      const target = item.rcaTarget || 'No RCA Equivalent';
      targetMap.set(target, (targetMap.get(target) || 0) + 1);
    }
  }

  // Use domain stats for source sizes
  const sortedDomains = [...assessment.domains]
    .sort((a, b) => b.stats.total - a.stats.total)
    .slice(0, 6);
  const totalSourceItems = sortedDomains.reduce((s, d) => s + d.stats.total, 0);

  let sourceY = 5;
  for (const domain of sortedDomains) {
    const height = (domain.stats.total / totalSourceItems) * 80;
    sources.push({
      label: domain.id,
      count: domain.stats.total,
      color:
        domain.complexity === 'high'
          ? '#ef4444'
          : domain.complexity === 'moderate'
            ? '#f59e0b'
            : '#10b981',
      y: sourceY,
      height: Math.max(height, 4),
    });
    sourceY += height + 2;
  }

  // Build target buckets from RCA targets (top 5)
  const sortedTargets = [...targetMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalTargetItems = sortedTargets.reduce((s, [, c]) => s + c, 0);
  const targets: FlowBucket[] = [];
  let targetY = 5;
  for (const [label, count] of sortedTargets) {
    const height = (count / totalTargetItems) * 80;
    const isBlocked = label === 'No RCA Equivalent';
    targets.push({
      label,
      count,
      color: isBlocked ? '#ef4444' : '#3b82f6',
      y: targetY,
      height: Math.max(height, 4),
    });
    targetY += height + 2;
  }

  // Build flow links (simplified: source → target based on migration status)
  const links: FlowLink[] = [];
  const statusColors = {
    auto: '#10b981',
    guided: '#f59e0b',
    manual: '#ef4444',
    blocked: '#94a3b8',
  };

  for (let i = 0; i < sources.length && i < targets.length; i++) {
    const source = sources[i];
    const target = targets[Math.min(i, targets.length - 1)];
    const domain = sortedDomains[i];

    const statusColor =
      domain.complexity === 'high'
        ? statusColors.manual
        : domain.complexity === 'moderate'
          ? statusColors.guided
          : statusColors.auto;

    links.push({
      sourceY: source.y,
      sourceHeight: source.height,
      targetY: target.y,
      targetHeight: target.height,
      color: statusColor,
      opacity: 0.3,
    });
  }

  return { sources, targets, links };
}

// ---------------------------------------------------------------------------
// SVG path for curved flow
// ---------------------------------------------------------------------------

function flowPath(sy: number, sh: number, ty: number, th: number): string {
  const sx = 25;
  const tx = 75;
  const mx = 50;

  return [
    `M ${sx} ${sy}`,
    `C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`,
    `L ${tx} ${ty + th}`,
    `C ${mx} ${ty + th}, ${mx} ${sy + sh}, ${sx} ${sy + sh}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TransformationFlowProps {
  assessment: AssessmentData;
  t: (key: string) => string;
}

export default function TransformationFlow({ assessment, t }: TransformationFlowProps) {
  const { sources, targets, links } = useMemo(() => buildFlowData(assessment), [assessment]);

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="transformation-flow">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {t('assessment.itemDetail.cpqRcaMapping')}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Legacy Objects → Migration Engine → Target Architecture
        </p>
      </div>

      {/* Column labels */}
      <div className="flex items-center justify-between mb-2 px-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">CPQ Source</span>
        <span className="text-xs font-semibold text-violet-600 uppercase">Transformation</span>
        <span className="text-xs font-semibold text-slate-500 uppercase">RCA Target</span>
      </div>

      <svg
        viewBox="0 0 100 95"
        className="w-full"
        style={{ minHeight: 300 }}
        role="img"
        aria-label="CPQ to RCA transformation flow"
      >
        {/* Flow paths */}
        {links.map((link, i) => (
          <path
            key={`link-${i}`}
            d={flowPath(link.sourceY, link.sourceHeight, link.targetY, link.targetHeight)}
            fill={link.color}
            fillOpacity={link.opacity}
            stroke={link.color}
            strokeWidth={0.2}
            strokeOpacity={0.5}
          />
        ))}

        {/* Source bars */}
        {sources.map((s, i) => (
          <g key={`src-${i}`}>
            <rect
              x={2}
              y={s.y}
              width={8}
              height={s.height}
              rx={1.5}
              fill={s.color}
              fillOpacity={0.8}
            />
            <text x={11} y={s.y + s.height / 2 + 1} fontSize={2.2} fill="#475569" fontWeight={500}>
              {t(`assessment.tabs.${s.label}`)}
            </text>
            <text x={11} y={s.y + s.height / 2 + 3.5} fontSize={1.8} fill="#94a3b8">
              {s.count} items
            </text>
          </g>
        ))}

        {/* Target bars */}
        {targets.map((tgt, i) => (
          <g key={`tgt-${i}`}>
            <rect
              x={90}
              y={tgt.y}
              width={8}
              height={tgt.height}
              rx={1.5}
              fill={tgt.color}
              fillOpacity={0.8}
            />
            <text
              x={89}
              y={tgt.y + tgt.height / 2 + 1}
              fontSize={2}
              fill="#475569"
              fontWeight={500}
              textAnchor="end"
            >
              {tgt.label.length > 22 ? tgt.label.slice(0, 20) + '...' : tgt.label}
            </text>
          </g>
        ))}

        {/* Center dot for transformation */}
        <circle
          cx={50}
          cy={47}
          r={2}
          fill="#8b5cf6"
          fillOpacity={0.15}
          stroke="#8b5cf6"
          strokeWidth={0.3}
        />
        <circle cx={50} cy={47} r={0.8} fill="#8b5cf6" />
      </svg>
    </div>
  );
}
