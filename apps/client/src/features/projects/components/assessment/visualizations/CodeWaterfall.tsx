/**
 * Code Complexity Waterfall
 *
 * Horizontal bars showing the largest code artifacts, sized by LOC,
 * colored by migration status. Makes the biggest effort items
 * immediately visible.
 */
import type { AssessmentItem } from '../../../mocks/assessment-mock-data';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  auto: { bg: 'bg-emerald-400', text: 'text-emerald-800' },
  guided: { bg: 'bg-amber-400', text: 'text-amber-800' },
  manual: { bg: 'bg-red-400', text: 'text-red-50' },
  blocked: { bg: 'bg-slate-600', text: 'text-slate-50' },
};

interface CodeWaterfallProps {
  items: AssessmentItem[];
  t: (key: string) => string;
}

export default function CodeWaterfall({ items, t }: CodeWaterfallProps) {
  // Filter items with LOC and sort descending
  const codeItems = items
    .filter((i) => i.linesOfCode && i.linesOfCode > 0)
    .sort((a, b) => (b.linesOfCode || 0) - (a.linesOfCode || 0));

  if (codeItems.length === 0) return null;

  const maxLoc = codeItems[0].linesOfCode || 1;
  const totalLoc = codeItems.reduce((s, i) => s + (i.linesOfCode || 0), 0);

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="code-waterfall">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Code Complexity Breakdown
        </h3>
        <span className="text-xs text-slate-400 tabular-nums">
          {totalLoc.toLocaleString()} total {t('assessment.table.linesOfCode')}
        </span>
      </div>

      <div className="space-y-2">
        {codeItems.map((item) => {
          const loc = item.linesOfCode || 0;
          const width = Math.max((loc / maxLoc) * 100, 8);
          const { bg, text } = STATUS_COLORS[item.migrationStatus] || STATUS_COLORS.manual;

          return (
            <div key={item.id} className="flex items-center gap-3">
              <div className="w-36 shrink-0">
                <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
              </div>
              <div className="flex-1">
                <div
                  className={`${bg} h-7 rounded-lg flex items-center px-2.5 transition-all`}
                  style={{ width: `${width}%` }}
                >
                  <span className={`text-xs font-semibold ${text} whitespace-nowrap`}>
                    {loc} LOC
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-400 w-14 text-end">
                {t(`assessment.migrationStatus.${item.migrationStatus}`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
