/**
 * Deployment Page
 *
 * Shows deployment management or contextual empty state.
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Rocket } from 'lucide-react';

export default function DeploymentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <Rocket size={28} className="text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          {t('workspace.placeholder.deployment.heading')}
        </h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {t('workspace.placeholder.deployment.description')}
        </p>
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          aria-label={t('workspace.placeholder.deployment.cta')}
        >
          {t('workspace.placeholder.deployment.cta')}
        </button>
        <p className="text-xs text-slate-400 mt-4">
          {t('workspace.placeholder.deployment.locked')}
        </p>
      </div>
    </div>
  );
}
