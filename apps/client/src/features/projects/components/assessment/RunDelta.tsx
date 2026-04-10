/**
 * Run Delta — Run comparison and delta summary
 *
 * Run selector dropdown in header + delta summary card showing
 * what changed between assessment runs.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AssessmentRun, RunDelta as RunDeltaType } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DELTA_ICONS: Record<string, { icon: string; color: string }> = {
  added: { icon: '+', color: 'text-emerald-600 bg-emerald-50' },
  removed: { icon: '−', color: 'text-red-600 bg-red-50' },
  changed: { icon: '~', color: 'text-amber-600 bg-amber-50' },
  unchanged: { icon: '=', color: 'text-slate-400 bg-slate-50' },
};

// ---------------------------------------------------------------------------
// Run Selector
// ---------------------------------------------------------------------------

interface RunSelectorProps {
  runs: AssessmentRun[];
  currentIndex: number;
  onRunChange: (index: number) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function RunSelector({ runs, currentIndex, onRunChange, t }: RunSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = runs[currentIndex];

  return (
    <div className="relative" data-testid="run-selector">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-full font-medium transition-colors"
        aria-label="Select run"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        {t('assessment.header.runInfo', {
          number: current.number,
          timeAgo: formatTimeAgo(current.completedAt),
        })}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 start-0 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20 min-w-[200px]">
          {runs.map((run, i) => (
            <button
              key={run.id}
              onClick={() => {
                onRunChange(i);
                setOpen(false);
              }}
              className={`w-full text-start px-3 py-2 text-sm hover:bg-slate-50 ${i === currentIndex ? 'text-violet-600 font-medium' : 'text-slate-700'}`}
            >
              Run #{run.number} · {formatTimeAgo(run.completedAt)} · {run.itemsScanned} items
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delta Summary
// ---------------------------------------------------------------------------

interface DeltaSummaryProps {
  delta: RunDeltaType;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function DeltaSummary({ delta, t }: DeltaSummaryProps) {
  return (
    <section data-testid="delta-summary" className="bg-white rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {t('assessment.overview.changesSinceLastRun')}
      </h3>

      {/* Summary counts */}
      <div className="flex items-center gap-4 mb-3">
        <span className="text-sm text-emerald-600 font-medium">+{delta.added} added</span>
        <span className="text-sm text-red-600 font-medium">−{delta.removed} removed</span>
        <span className="text-sm text-amber-600 font-medium">~{delta.changed} changed</span>
      </div>

      {/* Detail entries */}
      <div className="space-y-2">
        {delta.details.map((detail, i) => {
          const { icon, color } = DELTA_ICONS[detail.type] || DELTA_ICONS.unchanged;
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-xs font-bold shrink-0 mt-0.5`}
              >
                {icon}
              </span>
              <p className="text-sm text-slate-700">{t(detail.text)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
