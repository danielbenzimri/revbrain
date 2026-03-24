/**
 * Risk Register — Dedicated view
 *
 * Full risk table with category, severity, likelihood×impact,
 * affected items, mitigation, and owner. Filterable and searchable.
 * Includes a simple risk heat map (likelihood × impact grid).
 */
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import type { AssessmentRisk, RiskCategory, RiskSeverity } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<RiskSeverity, string> = {
  critical: 'text-red-700 bg-red-50',
  high: 'text-red-600 bg-red-50',
  medium: 'text-amber-700 bg-amber-50',
  low: 'text-emerald-700 bg-emerald-50',
};

const CATEGORY_STYLES: Record<RiskCategory, string> = {
  technical: 'text-blue-700 bg-blue-50',
  business: 'text-violet-700 bg-violet-50',
  timeline: 'text-amber-700 bg-amber-50',
  organizational: 'text-slate-700 bg-slate-100',
};

// ---------------------------------------------------------------------------
// Risk Heat Map
// ---------------------------------------------------------------------------

interface HeatMapProps {
  risks: AssessmentRisk[];
  t: (key: string) => string;
}

function RiskHeatMap({ risks, t }: HeatMapProps) {
  // 5x5 grid: likelihood (x) × impact (y)
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
  for (const risk of risks) {
    grid[5 - risk.impact][risk.likelihood - 1]++;
  }

  const cellColor = (row: number, col: number) => {
    const score = (5 - row) * (col + 1); // impact × likelihood
    if (score >= 15) return 'bg-red-100';
    if (score >= 8) return 'bg-amber-100';
    return 'bg-emerald-50';
  };

  return (
    <div data-testid="risk-heat-map" className="bg-white rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('assessment.riskRegister.heatMap')}</h3>
      <div className="flex items-end gap-2">
        <div className="text-xs text-slate-400 -rotate-90 mb-10 whitespace-nowrap">
          {t('assessment.riskRegister.impact')} →
        </div>
        <div>
          <div className="grid grid-cols-5 gap-1">
            {grid.map((row, ri) =>
              row.map((count, ci) => (
                <div
                  key={`${ri}-${ci}`}
                  className={`w-8 h-8 rounded flex items-center justify-center text-xs font-medium ${cellColor(ri, ci)} ${count > 0 ? 'text-slate-800' : 'text-slate-300'}`}
                >
                  {count > 0 ? count : ''}
                </div>
              )),
            )}
          </div>
          <p className="text-xs text-slate-400 text-center mt-1">
            {t('assessment.riskRegister.likelihood')} →
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RiskRegisterProps {
  risks: AssessmentRisk[];
  onClose?: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function RiskRegister({ risks, onClose, t }: RiskRegisterProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return risks.filter((risk) => {
      if (search && !risk.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter !== 'all' && risk.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && risk.severity !== severityFilter) return false;
      return true;
    });
  }, [risks, search, categoryFilter, severityFilter]);

  return (
    <div className="space-y-4" data-testid="risk-register">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('assessment.riskRegister.title')}
        </h2>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X size={18} className="text-slate-400" />
          </button>
        )}
      </div>

      {/* Heat Map */}
      <RiskHeatMap risks={risks} t={t} />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('assessment.table.search')}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
          aria-label={t('assessment.table.search')}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          aria-label={t('assessment.riskRegister.category')}
        >
          <option value="all">{t('assessment.table.filterAll')}</option>
          <option value="technical">{t('assessment.riskRegister.categories.technical')}</option>
          <option value="business">{t('assessment.riskRegister.categories.business')}</option>
          <option value="timeline">{t('assessment.riskRegister.categories.timeline')}</option>
          <option value="organizational">{t('assessment.riskRegister.categories.organizational')}</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          aria-label={t('assessment.riskRegister.severity')}
        >
          <option value="all">{t('assessment.table.filterAll')}</option>
          <option value="critical">{t('assessment.riskRegister.severities.critical')}</option>
          <option value="high">{t('assessment.riskRegister.severities.high')}</option>
          <option value="medium">{t('assessment.riskRegister.severities.medium')}</option>
          <option value="low">{t('assessment.riskRegister.severities.low')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-xs font-medium text-slate-500 uppercase">
              <th className="text-start px-4 py-3">{t('assessment.riskRegister.description')}</th>
              <th className="text-start px-4 py-3">{t('assessment.riskRegister.category')}</th>
              <th className="text-start px-4 py-3">{t('assessment.riskRegister.severity')}</th>
              <th className="text-start px-4 py-3">{t('assessment.riskRegister.mitigation')}</th>
              <th className="text-start px-4 py-3">{t('assessment.riskRegister.owner')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((risk) => (
              <tr key={risk.id} className="hover:bg-slate-50/50" role="row">
                <td className="px-4 py-3 max-w-xs">
                  <p className="text-sm text-slate-700 leading-snug">{risk.description}</p>
                  {risk.affectedDomains.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      {risk.affectedDomains.map((d) => t(`assessment.tabs.${d}`)).join(', ')}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLES[risk.category]}`}>
                    {t(`assessment.riskRegister.categories.${risk.category}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_STYLES[risk.severity]}`}>
                    {t(`assessment.riskRegister.severities.${risk.severity}`)}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <p className="text-sm text-slate-600 leading-snug">{risk.mitigation}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-500">
                    {risk.owner || t('assessment.riskRegister.unassigned')}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  {t('assessment.table.noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
