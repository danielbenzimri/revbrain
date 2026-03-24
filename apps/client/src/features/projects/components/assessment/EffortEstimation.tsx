/**
 * Effort Estimation Table
 *
 * Domain × category grid with auto-populated counts and
 * consultant-editable hours column. Auto-sums. Additional
 * rows for Testing, PM, and Training.
 */
import { useState, useMemo } from 'react';
import type { AssessmentData } from '../../mocks/assessment-mock-data';

interface EffortEstimationProps {
  assessment: AssessmentData;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function EffortEstimation({ assessment, t }: EffortEstimationProps) {
  // Editable hours per domain
  const [domainHours, setDomainHours] = useState<Record<string, string>>({});
  const [testingHours, setTestingHours] = useState('');
  const [pmHours, setPmHours] = useState('');
  const [trainingHours, setTrainingHours] = useState('');

  const domainRows = assessment.domains.map((d) => ({
    id: d.id,
    label: t(`assessment.tabs.${d.id}`),
    total: d.stats.total,
    auto: d.stats.auto,
    guided: d.stats.guided,
    manual: d.stats.manual,
  }));

  const subtotalItems = domainRows.reduce((s, r) => s + r.total, 0);
  const subtotalAuto = domainRows.reduce((s, r) => s + r.auto, 0);
  const subtotalGuided = domainRows.reduce((s, r) => s + r.guided, 0);
  const subtotalManual = domainRows.reduce((s, r) => s + r.manual, 0);

  const domainHoursSum = useMemo(() => {
    return Object.values(domainHours).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }, [domainHours]);

  const additionalHoursSum = (parseFloat(testingHours) || 0) + (parseFloat(pmHours) || 0) + (parseFloat(trainingHours) || 0);
  const grandTotal = domainHoursSum + additionalHoursSum;

  return (
    <div className="space-y-4" data-testid="effort-estimation">
      <h2 className="text-lg font-semibold text-slate-900">
        {t('assessment.effortEstimation.title')}
      </h2>

      <div className="bg-white rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-xs font-medium text-slate-500 uppercase">
              <th className="text-start px-4 py-3">{t('assessment.effortEstimation.domain')}</th>
              <th className="text-end px-4 py-3">{t('assessment.effortEstimation.items')}</th>
              <th className="text-end px-4 py-3">{t('assessment.effortEstimation.auto')}</th>
              <th className="text-end px-4 py-3">{t('assessment.effortEstimation.guided')}</th>
              <th className="text-end px-4 py-3">{t('assessment.effortEstimation.manual')}</th>
              <th className="text-end px-4 py-3">{t('assessment.effortEstimation.estHours')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {domainRows.map((row) => (
              <tr key={row.id} role="row">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.label}</td>
                <td className="px-4 py-3 text-sm text-slate-600 text-end tabular-nums">{row.total}</td>
                <td className="px-4 py-3 text-sm text-emerald-600 text-end tabular-nums">{row.auto}</td>
                <td className="px-4 py-3 text-sm text-amber-600 text-end tabular-nums">{row.guided}</td>
                <td className="px-4 py-3 text-sm text-red-600 text-end tabular-nums">{row.manual}</td>
                <td className="px-4 py-3 text-end">
                  <input
                    type="number"
                    value={domainHours[row.id] || ''}
                    onChange={(e) => setDomainHours((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    className="w-20 px-2 py-1 text-sm text-end border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 tabular-nums"
                    placeholder="—"
                    aria-label={`${row.label} hours`}
                  />
                </td>
              </tr>
            ))}

            {/* Subtotal */}
            <tr className="bg-slate-50 font-semibold" role="row">
              <td className="px-4 py-3 text-sm text-slate-900">{t('assessment.effortEstimation.subtotal')}</td>
              <td className="px-4 py-3 text-sm text-slate-900 text-end tabular-nums">{subtotalItems}</td>
              <td className="px-4 py-3 text-sm text-emerald-700 text-end tabular-nums">{subtotalAuto}</td>
              <td className="px-4 py-3 text-sm text-amber-700 text-end tabular-nums">{subtotalGuided}</td>
              <td className="px-4 py-3 text-sm text-red-700 text-end tabular-nums">{subtotalManual}</td>
              <td className="px-4 py-3 text-sm text-slate-900 text-end tabular-nums" data-testid="subtotal-hours">
                {domainHoursSum > 0 ? domainHoursSum : '—'}
              </td>
            </tr>

            {/* Additional rows */}
            <tr role="row">
              <td className="px-4 py-3 text-sm text-slate-700">{t('assessment.effortEstimation.testingQa')}</td>
              <td colSpan={4}></td>
              <td className="px-4 py-3 text-end">
                <input
                  type="number"
                  value={testingHours}
                  onChange={(e) => setTestingHours(e.target.value)}
                  className="w-20 px-2 py-1 text-sm text-end border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 tabular-nums"
                  placeholder="—"
                  aria-label="Testing hours"
                />
              </td>
            </tr>
            <tr role="row">
              <td className="px-4 py-3 text-sm text-slate-700">{t('assessment.effortEstimation.projectMgmt')}</td>
              <td colSpan={4}></td>
              <td className="px-4 py-3 text-end">
                <input
                  type="number"
                  value={pmHours}
                  onChange={(e) => setPmHours(e.target.value)}
                  className="w-20 px-2 py-1 text-sm text-end border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 tabular-nums"
                  placeholder="—"
                  aria-label="PM hours"
                />
              </td>
            </tr>
            <tr role="row">
              <td className="px-4 py-3 text-sm text-slate-700">{t('assessment.effortEstimation.trainingCm')}</td>
              <td colSpan={4}></td>
              <td className="px-4 py-3 text-end">
                <input
                  type="number"
                  value={trainingHours}
                  onChange={(e) => setTrainingHours(e.target.value)}
                  className="w-20 px-2 py-1 text-sm text-end border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 tabular-nums"
                  placeholder="—"
                  aria-label="Training hours"
                />
              </td>
            </tr>

            {/* Grand Total */}
            <tr className="bg-violet-50 font-bold" role="row">
              <td className="px-4 py-3 text-sm text-violet-900">{t('assessment.effortEstimation.grandTotal')}</td>
              <td colSpan={4}></td>
              <td className="px-4 py-3 text-sm text-violet-900 text-end tabular-nums" data-testid="grand-total">
                {grandTotal > 0 ? grandTotal : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
