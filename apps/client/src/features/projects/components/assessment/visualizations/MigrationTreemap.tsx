/**
 * Migration Readiness Treemap
 *
 * Sizes blocks by item count (impact), colors by dominant migration status.
 * Instantly communicates "where is the work?" with visual weight = effort.
 */
import type { DomainData, DomainId } from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Color logic
// ---------------------------------------------------------------------------

function getDominantStatus(stats: DomainData['stats']): { status: string; color: string; textColor: string } {
  const { auto, manual, blocked, total } = stats;
  if (total === 0) return { status: 'empty', color: 'bg-slate-100', textColor: 'text-slate-600' };

  const autoPercent = auto / total;
  const manualPercent = (manual + blocked) / total;

  if (manualPercent > 0.5) return { status: 'manual', color: 'bg-red-100 border border-red-200', textColor: 'text-red-800' };
  if (autoPercent > 0.5) return { status: 'auto', color: 'bg-emerald-100 border border-emerald-200', textColor: 'text-emerald-800' };
  return { status: 'guided', color: 'bg-amber-100 border border-amber-200', textColor: 'text-amber-800' };
}

function getStatusBadge(status: string, t: (key: string) => string): { label: string; className: string } {
  switch (status) {
    case 'auto': return { label: t('assessment.migrationStatus.auto'), className: 'bg-emerald-200 text-emerald-800' };
    case 'guided': return { label: t('assessment.migrationStatus.guided'), className: 'bg-amber-200 text-amber-800' };
    case 'manual': return { label: t('assessment.migrationStatus.manual'), className: 'bg-red-200 text-red-800' };
    default: return { label: '—', className: 'bg-slate-200 text-slate-600' };
  }
}

// ---------------------------------------------------------------------------
// Layout algorithm (simple squarified treemap)
// ---------------------------------------------------------------------------

interface TreemapBlock {
  domain: DomainData;
  width: number; // percentage
  height: number; // percentage
}

function calculateLayout(domains: DomainData[]): TreemapBlock[] {
  const total = domains.reduce((s, d) => s + d.stats.total, 0);
  if (total === 0) return [];

  // Sort by size descending for better layout
  const sorted = [...domains].sort((a, b) => b.stats.total - a.stats.total);

  // Simple 2-row layout: top row = large domains, bottom row = small domains
  const topRow = sorted.slice(0, 4);
  const bottomRow = sorted.slice(4);

  const topTotal = topRow.reduce((s, d) => s + d.stats.total, 0);
  const bottomTotal = bottomRow.reduce((s, d) => s + d.stats.total, 0);

  const topHeight = total > 0 ? Math.max(45, Math.min(70, (topTotal / total) * 100)) : 50;
  const bottomHeight = 100 - topHeight;

  const blocks: TreemapBlock[] = [];

  for (const domain of topRow) {
    blocks.push({
      domain,
      width: topTotal > 0 ? (domain.stats.total / topTotal) * 100 : 25,
      height: topHeight,
    });
  }

  for (const domain of bottomRow) {
    blocks.push({
      domain,
      width: bottomTotal > 0 ? (domain.stats.total / bottomTotal) * 100 : 20,
      height: bottomHeight,
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MigrationTreemapProps {
  domains: DomainData[];
  onDomainClick: (domainId: DomainId) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function MigrationTreemap({ domains, onDomainClick, t }: MigrationTreemapProps) {
  const blocks = calculateLayout(domains);
  const totalItems = domains.reduce((s, d) => s + d.stats.total, 0);

  const topBlocks = blocks.slice(0, 4);
  const bottomBlocks = blocks.slice(4);

  return (
    <div data-testid="migration-treemap">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          {t('assessment.overview.complexityByDomain')}
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
            {t('assessment.migrationStatus.auto')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />
            {t('assessment.migrationStatus.guided')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-200" />
            {t('assessment.migrationStatus.manual')}
          </span>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ minHeight: 320 }}>
        {/* Top row */}
        <div className="flex" style={{ height: `${topBlocks[0]?.height || 60}%` }}>
          {topBlocks.map((block) => {
            const { color, textColor } = getDominantStatus(block.domain.stats);
            const badge = getStatusBadge(getDominantStatus(block.domain.stats).status, t);
            const pct = totalItems > 0 ? Math.round((block.domain.stats.total / totalItems) * 100) : 0;

            return (
              <button
                key={block.domain.id}
                onClick={() => onDomainClick(block.domain.id)}
                className={`${color} p-4 flex flex-col justify-end transition-opacity hover:opacity-90`}
                style={{ width: `${block.width}%`, minHeight: 140 }}
              >
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded self-end mb-auto ${badge.className}`}>
                  {badge.label}
                </span>
                <div>
                  <p className={`text-2xl font-bold ${textColor}`}>{pct}%</p>
                  <p className={`text-sm font-semibold ${textColor}`}>
                    {t(`assessment.tabs.${block.domain.id}`)}
                  </p>
                  <p className={`text-xs ${textColor} opacity-70`}>
                    {block.domain.stats.total} {t('assessment.table.items')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bottom row */}
        <div className="flex" style={{ height: `${bottomBlocks[0]?.height || 40}%` }}>
          {bottomBlocks.map((block) => {
            const { color, textColor } = getDominantStatus(block.domain.stats);
            const pct = totalItems > 0 ? Math.round((block.domain.stats.total / totalItems) * 100) : 0;

            return (
              <button
                key={block.domain.id}
                onClick={() => onDomainClick(block.domain.id)}
                className={`${color} p-3 flex flex-col justify-end transition-opacity hover:opacity-90`}
                style={{ width: `${block.width}%`, minHeight: 100 }}
              >
                <p className={`text-lg font-bold ${textColor}`}>{pct}%</p>
                <p className={`text-xs font-semibold ${textColor}`}>
                  {t(`assessment.tabs.${block.domain.id}`)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
