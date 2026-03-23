/**
 * Assessment Page
 *
 * Shows migration readiness assessment results or contextual empty state.
 */
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { getMockProjectWorkspaceData } from '../../mocks/workspace-mock-data';

export default function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const data = useMemo(() => {
    if (!id) return null;
    return getMockProjectWorkspaceData(id);
  }, [id]);

  if (!id) return null;

  if (data?.assessment) {
    const a = data.assessment;
    const segments = [
      { label: 'Auto', count: a.autoMigrate, color: 'bg-emerald-500' },
      { label: 'Guided', count: a.guidedMigrate, color: 'bg-violet-500' },
      { label: 'Manual', count: a.manualMigrate, color: 'bg-amber-500' },
      { label: 'Blocked', count: a.blocked, color: 'bg-red-500' },
    ];

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {t('workspace.placeholder.assessment.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {a.totalRules} rules analyzed &middot; Score: {a.score}%
          </p>
        </div>

        {/* Score bar */}
        <div className="bg-white rounded-2xl p-6">
          <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-slate-100 mb-6">
            {segments.map((seg) =>
              seg.count > 0 ? (
                <div
                  key={seg.label}
                  className={`${seg.color} h-full transition-all`}
                  style={{ width: `${(seg.count / a.totalRules) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {segments.map((seg) => (
              <div key={seg.label} className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${seg.color}`} />
                  <span className="text-sm font-medium text-slate-700">{seg.label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{seg.count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <ClipboardCheck size={28} className="text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          {t('workspace.placeholder.assessment.heading')}
        </h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {t('workspace.placeholder.assessment.description')}
        </p>
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          aria-label={t('workspace.placeholder.assessment.cta')}
        >
          {t('workspace.placeholder.assessment.cta')}
        </button>
        <p className="text-xs text-slate-400 mt-4">
          {t('workspace.placeholder.assessment.locked')}
        </p>
      </div>
    </div>
  );
}
