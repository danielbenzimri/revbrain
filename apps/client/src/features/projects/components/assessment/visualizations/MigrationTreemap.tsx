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

function getDominantColor(stats: DomainData['stats']): { bg: string; text: string; badge: string; badgeText: string; label: string } {
  const { auto, manual, blocked, total } = stats;
  if (total === 0) return { bg: 'bg-slate-50', text: 'text-slate-600', badge: 'bg-slate-200', badgeText: 'text-slate-600', label: '—' };

  const autoPercent = auto / total;
  const manualPercent = (manual + blocked) / total;

  if (manualPercent > 0.5) return { bg: 'bg-red-50', text: 'text-red-900', badge: 'bg-red-200', badgeText: 'text-red-800', label: 'Manual' };
  if (autoPercent > 0.5) return { bg: 'bg-emerald-50', text: 'text-emerald-900', badge: 'bg-emerald-200', badgeText: 'text-emerald-800', label: 'Auto' };
  return { bg: 'bg-amber-50', text: 'text-amber-900', badge: 'bg-amber-200', badgeText: 'text-amber-800', label: 'Guided' };
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
  const totalItems = domains.reduce((s, d) => s + d.stats.total, 0);

  // Sort by size descending
  const sorted = [...domains].sort((a, b) => b.stats.total - a.stats.total);

  // Split into top row (large) and bottom row (small)
  const topRow = sorted.slice(0, 4);
  const bottomRow = sorted.slice(4);
  const topTotal = topRow.reduce((s, d) => s + d.stats.total, 0);
  // bottomRow uses equal widths, no need for total

  return (
    <div data-testid="migration-treemap">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          {t('assessment.overview.complexityByDomain')}
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />
            {t('assessment.migrationStatus.auto')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" />
            {t('assessment.migrationStatus.guided')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-50 border border-red-200" />
            {t('assessment.migrationStatus.manual')}
          </span>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-slate-200">
        {/* Top row — large domains */}
        <div className="flex">
          {topRow.map((domain, i) => {
            const { bg, text, badge, badgeText, label } = getDominantColor(domain.stats);
            const pct = totalItems > 0 ? Math.round((domain.stats.total / totalItems) * 100) : 0;
            const width = topTotal > 0 ? (domain.stats.total / topTotal) * 100 : 25;

            return (
              <button
                key={domain.id}
                onClick={() => onDomainClick(domain.id)}
                className={`${bg} p-4 flex flex-col justify-between transition-all hover:brightness-95 overflow-hidden ${i > 0 ? 'border-s border-slate-200' : ''}`}
                style={{ width: `${width}%`, minHeight: 160 }}
              >
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded self-end ${badge} ${badgeText}`}>
                  {label}
                </span>
                <div className="mt-auto">
                  <p className={`text-3xl font-bold ${text}`}>{pct}%</p>
                  <p className={`text-sm font-semibold ${text} truncate`}>
                    {t(`assessment.tabs.${domain.id}`)}
                  </p>
                  <p className={`text-xs ${text} opacity-60`}>
                    {domain.stats.total} {t('assessment.table.items')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bottom row — smaller domains */}
        <div className="flex border-t border-slate-200">
          {bottomRow.map((domain, i) => {
            const { bg, text } = getDominantColor(domain.stats);
            const pct = totalItems > 0 ? Math.round((domain.stats.total / totalItems) * 100) : 0;
            // Use equal widths for bottom row to prevent tiny cells
            const width = 100 / bottomRow.length;

            return (
              <button
                key={domain.id}
                onClick={() => onDomainClick(domain.id)}
                className={`${bg} p-3 flex flex-col justify-end transition-all hover:brightness-95 overflow-hidden ${i > 0 ? 'border-s border-slate-200' : ''}`}
                style={{ width: `${width}%`, minHeight: 90 }}
              >
                <p className={`text-xl font-bold ${text}`}>{pct}%</p>
                <p className={`text-xs font-semibold ${text} truncate`}>
                  {t(`assessment.tabs.${domain.id}`)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
