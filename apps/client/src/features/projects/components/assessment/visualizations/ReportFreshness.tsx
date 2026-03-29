/**
 * Report Freshness Timeline
 *
 * Horizontal timeline showing report/dashboard last-run dates.
 * Color = CPQ-referencing (red) vs non-CPQ (green).
 * Helps prioritize which reports to rebuild.
 */
import { useMemo } from 'react';
import type { ReportDashboardItem } from '../../../mocks/assessment-mock-data';

interface ReportFreshnessProps {
  reports: ReportDashboardItem[];
  t: (key: string) => string;
}

export default function ReportFreshness({ reports, t }: ReportFreshnessProps) {
  // Stable timestamp for freshness calculations (captured once per mount)
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);
  const maxDays = 90;

  if (!reports || reports.length === 0) return null;

  // Sort by freshness (most recent first)
  const sorted = [...reports].sort((a, b) => {
    const aDate = a.lastRunDate ? new Date(a.lastRunDate).getTime() : 0;
    const bDate = b.lastRunDate ? new Date(b.lastRunDate).getTime() : 0;
    return bDate - aDate;
  });

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="report-freshness">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {t('assessment.subTabs.reportsDashboards')} — Freshness
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            CPQ-referencing
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            Non-CPQ
          </span>
        </div>
      </div>

      {/* Timeline header */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2 ms-40">
        <span>Today</span>
        <span>30d ago</span>
        <span>60d ago</span>
        <span>90d+</span>
      </div>

      <div className="space-y-1.5">
        {sorted.map((report) => {
          const lastRun = report.lastRunDate ? new Date(report.lastRunDate).getTime() : 0;
          const daysAgo = lastRun ? Math.floor((now - lastRun) / (24 * 60 * 60 * 1000)) : 999;
          const position = Math.min(daysAgo / maxDays, 1) * 100;
          const isCpq = report.referencesCpq;

          const dotColor = isCpq
            ? daysAgo > 30
              ? 'bg-red-500'
              : daysAgo > 7
                ? 'bg-amber-400'
                : 'bg-red-300'
            : 'bg-emerald-400';

          const freshLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1d ago' : `${daysAgo}d ago`;

          return (
            <div key={report.id} className="flex items-center gap-2">
              <div className="w-40 shrink-0 flex items-center gap-1.5">
                <span
                  className={`text-xs ${report.type === 'dashboard' ? 'text-violet-500' : 'text-slate-400'}`}
                >
                  {report.type === 'dashboard' ? '▦' : '▤'}
                </span>
                <span className="text-xs text-slate-700 truncate">{report.name}</span>
              </div>
              <div className="flex-1 relative h-5">
                <div className="absolute inset-0 bg-slate-50 rounded" />
                {/* Danger zone */}
                <div className="absolute end-0 top-0 bottom-0 w-1/3 bg-red-50/50 rounded-e" />
                {/* Dot */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${dotColor} shadow-sm`}
                  style={{ insetInlineStart: `${position}%` }}
                  title={`Last run: ${freshLabel}${isCpq ? ' — references CPQ objects' : ''}`}
                />
              </div>
              <span className="text-xs text-slate-400 w-14 text-end tabular-nums">
                {freshLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
