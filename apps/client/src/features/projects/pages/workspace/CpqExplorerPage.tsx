/**
 * CPQ Explorer Page
 *
 * Contextual empty state when data has not been extracted.
 * Shows extracted data breakdown once available.
 */
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import { getMockProjectWorkspaceData } from '../../mocks/workspace-mock-data';

export default function CpqExplorerPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Mock data provides page skeleton; real API data overlaid via hooks
  const data = useMemo(() => {
    if (!id) return null;
    return getMockProjectWorkspaceData(id);
  }, [id]);

  const hasData = data?.cpqExplorerData !== null;

  if (!id) return null;

  if (hasData && data?.cpqExplorerData) {
    const explorer = data.cpqExplorerData;
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {t('workspace.placeholder.cpqExplorer.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {explorer.totalObjects.toLocaleString()}{' '}
            {t('workspace.overview.connectionCards.objects').toLowerCase()} &middot;{' '}
            {explorer.totalRecords.toLocaleString()}{' '}
            {t('workspace.overview.connectionCards.records').toLowerCase()}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">
            {t('workspace.overview.connectionCards.objects')}
          </h2>
          <div className="divide-y divide-slate-100">
            {explorer.topObjects.map((obj) => (
              <div key={obj.name} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Database size={14} className="text-slate-400" />
                  <span className="text-sm font-medium text-slate-800">{obj.name}</span>
                </div>
                <span className="text-sm text-slate-500">{obj.recordCount.toLocaleString()}</span>
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
          <Database size={28} className="text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          {t('workspace.placeholder.cpqExplorer.heading')}
        </h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {t('workspace.placeholder.cpqExplorer.description')}
        </p>
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          aria-label={t('workspace.placeholder.cpqExplorer.cta')}
        >
          {t('workspace.placeholder.cpqExplorer.cta')}
        </button>
        <p className="text-xs text-slate-400 mt-4">
          {t('workspace.placeholder.cpqExplorer.locked')}
        </p>
      </div>
    </div>
  );
}
