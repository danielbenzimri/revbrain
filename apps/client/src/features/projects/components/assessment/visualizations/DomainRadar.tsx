/**
 * Domain Radar Chart
 *
 * Spider/radar chart with 9 axes (one per domain).
 * Shows the "shape" of the migration — which domains dominate,
 * which are simple. SVG polygon with calculated coordinates.
 */
import { useMemo } from 'react';
import type { DomainData } from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function polarToCartesian(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function polygonPoints(cx: number, cy: number, values: number[], maxValue: number, maxRadius: number): string {
  return values
    .map((v, i) => {
      const angle = (2 * Math.PI * i) / values.length - Math.PI / 2;
      const r = (v / maxValue) * maxRadius;
      const [x, y] = polarToCartesian(cx, cy, r, angle);
      return `${x},${y}`;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DomainRadarProps {
  domains: DomainData[];
  t: (key: string) => string;
}

export default function DomainRadar({ domains, t }: DomainRadarProps) {
  const cx = 50;
  const cy = 50;
  const maxRadius = 38;
  const rings = [0.25, 0.5, 0.75, 1.0];

  const { complexityValues, itemValues, maxItems } = useMemo(() => {
    const complexityMap = { low: 1, moderate: 2, high: 3 };
    const cv = domains.map((d) => complexityMap[d.complexity] || 1);
    const iv = domains.map((d) => d.stats.total);
    const maxI = Math.max(...iv, 1);
    return { complexityValues: cv, itemValues: iv, maxItems: maxI };
  }, [domains]);

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="domain-radar">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        Migration Complexity Shape
      </h3>

      <svg viewBox="0 0 100 100" className="w-full" style={{ maxWidth: 360, margin: '0 auto' }} role="img" aria-label="Domain complexity radar chart">
        {/* Background rings */}
        {rings.map((ring) => (
          <polygon
            key={`ring-${ring}`}
            points={polygonPoints(cx, cy, new Array(domains.length).fill(ring * 3), 3, maxRadius)}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={0.2}
          />
        ))}

        {/* Axis lines */}
        {domains.map((_, i) => {
          const angle = (2 * Math.PI * i) / domains.length - Math.PI / 2;
          const [x, y] = polarToCartesian(cx, cy, maxRadius + 2, angle);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth={0.15}
            />
          );
        })}

        {/* Complexity polygon (filled) */}
        <polygon
          points={polygonPoints(cx, cy, complexityValues, 3, maxRadius)}
          fill="#8b5cf6"
          fillOpacity={0.1}
          stroke="#8b5cf6"
          strokeWidth={0.5}
        />

        {/* Item count polygon (line only) */}
        <polygon
          points={polygonPoints(cx, cy, itemValues, maxItems, maxRadius)}
          fill="#3b82f6"
          fillOpacity={0.05}
          stroke="#3b82f6"
          strokeWidth={0.3}
          strokeDasharray="1,0.5"
        />

        {/* Data points */}
        {domains.map((domain, i) => {
          const angle = (2 * Math.PI * i) / domains.length - Math.PI / 2;
          const complexityR = (complexityValues[i] / 3) * maxRadius;
          const [x, y] = polarToCartesian(cx, cy, complexityR, angle);
          const [labelX, labelY] = polarToCartesian(cx, cy, maxRadius + 6, angle);

          const dotColor = domain.complexity === 'high' ? '#ef4444' :
            domain.complexity === 'moderate' ? '#f59e0b' : '#10b981';

          return (
            <g key={domain.id}>
              <circle cx={x} cy={y} r={1.2} fill={dotColor} />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={2.3}
                fill="#475569"
                fontWeight={500}
              >
                {t(`assessment.tabs.${domain.id}`)}
              </text>
              <text
                x={labelX}
                y={labelY + 3}
                textAnchor="middle"
                fontSize={1.8}
                fill="#94a3b8"
              >
                {domain.stats.total}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-violet-500 inline-block" />
          Complexity
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-blue-400 inline-block" style={{ borderTop: '1px dashed #3b82f6' }} />
          Item Count
        </span>
      </div>
    </div>
  );
}
