/**
 * Item Detail Panel (Slide-Over)
 *
 * Opens when clicking an item in any inventory table.
 * Shows full item detail with CPQ→RCA mapping, AI description,
 * dependencies, recommendation, and consultant notes.
 */
import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { AssessmentItem } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Complexity / Status badges
// ---------------------------------------------------------------------------

const COMPLEXITY_COLORS: Record<string, string> = {
  low: 'text-emerald-700 bg-emerald-50',
  moderate: 'text-amber-700 bg-amber-50',
  high: 'text-red-700 bg-red-50',
};

const STATUS_COLORS: Record<string, string> = {
  auto: 'text-emerald-700 bg-emerald-50',
  guided: 'text-amber-700 bg-amber-50',
  manual: 'text-red-700 bg-red-50',
  blocked: 'text-slate-700 bg-slate-200',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ItemDetailPanelProps {
  item: AssessmentItem | null;
  onClose: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function ItemDetailPanel({ item, onClose, t }: ItemDetailPanelProps) {
  const [noteText, setNoteText] = useState('');

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="item-detail-panel"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="absolute inset-y-0 end-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900" data-testid="item-name">{item.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{item.apiName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Status Block */}
          <section data-testid="status-block">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">{t('assessment.itemDetail.complexity')}</p>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${COMPLEXITY_COLORS[item.complexity] || ''}`}>
                  {t(`assessment.complexity.${item.complexity}`)}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t('assessment.itemDetail.migrationStatus')}</p>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[item.migrationStatus] || ''}`}>
                  {t(`assessment.migrationStatus.${item.migrationStatus}`)}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t('assessment.itemDetail.active')}</p>
                <span className="text-sm text-slate-700">
                  {item.isActive ? t('assessment.itemDetail.active') : t('assessment.itemDetail.inactive')}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t('assessment.itemDetail.lastModified')}</p>
                <span className="text-sm text-slate-700">
                  {new Date(item.lastModified).toLocaleDateString()}
                </span>
              </div>
            </div>
          </section>

          {/* AI Description */}
          <section className="bg-violet-50/50 rounded-xl p-4 border border-violet-100" data-testid="ai-description">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={14} className="text-violet-500" />
              <span className="text-xs font-medium text-violet-600">
                {t('assessment.itemDetail.aiDescription')}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{item.aiDescription}</p>
            <div className="flex items-center gap-3 mt-3">
              <button className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                {t('assessment.itemDetail.edit')}
              </button>
              <button className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                {t('assessment.itemDetail.verify')}
              </button>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-400">{t('assessment.itemDetail.aiDisclaimer')}</span>
            </div>
          </section>

          {/* CPQ → RCA Mapping */}
          <section data-testid="cpq-rca-mapping">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              {t('assessment.itemDetail.cpqRcaMapping')}
            </h3>
            <div className="space-y-3">
              {/* CPQ Current */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">{t('assessment.itemDetail.cpqCurrent')}</p>
                <p className="text-sm text-slate-900 font-mono">{item.apiName}</p>
                {item.linesOfCode && (
                  <p className="text-xs text-slate-400 mt-1">{item.linesOfCode} {t('assessment.table.linesOfCode')}</p>
                )}
              </div>
              {/* Arrow */}
              <div className="text-center text-slate-300 text-lg">↓</div>
              {/* RCA Target */}
              <div className={`rounded-xl p-4 ${item.rcaTarget ? 'bg-violet-50' : 'bg-red-50'}`}>
                <p className="text-xs font-medium text-slate-500 mb-1">{t('assessment.itemDetail.rcaTargetState')}</p>
                <p className="text-sm text-slate-900">{item.rcaTarget || '—'}</p>
                {item.whyStatus && (
                  <p className="text-xs text-slate-500 mt-1 italic">{item.whyStatus}</p>
                )}
              </div>
            </div>
          </section>

          {/* Dependencies */}
          {item.dependencies.length > 0 && (
            <section data-testid="dependencies">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                {t('assessment.itemDetail.dependencies')}
              </h3>
              <ul className="space-y-1">
                {item.dependencies.map((dep, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-slate-300">·</span>
                    {dep}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recommendation */}
          <section data-testid="recommendation">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              {t('assessment.itemDetail.recommendation')}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {item.whyStatus}
            </p>
            {item.estimatedHours && (
              <p className="text-sm text-slate-500 mt-2">
                {t('assessment.itemDetail.estimatedHours')}: {item.estimatedHours}h
              </p>
            )}
          </section>

          {/* Consultant Notes */}
          <section data-testid="consultant-notes">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              {t('assessment.itemDetail.consultantNotes')}
            </h3>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full h-20 px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder={t('assessment.itemDetail.addNote')}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
