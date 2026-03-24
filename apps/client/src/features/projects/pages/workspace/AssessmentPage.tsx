/**
 * Assessment Page
 *
 * Multi-tab assessment workspace replacing the traditional 100-page PDF.
 * Shows migration readiness assessment results or contextual empty state.
 */
import { useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, ChevronDown } from 'lucide-react';
import { getMockAssessmentData, DOMAIN_TAB_ORDER } from '../../mocks/assessment-mock-data';
import type { DomainId, AssessmentData } from '../../mocks/assessment-mock-data';
import OverviewTab from '../../components/assessment/OverviewTab';

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type TabId = 'overview' | DomainId;

const ALL_TABS: TabId[] = ['overview', ...DOMAIN_TAB_ORDER];

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

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  assessment: AssessmentData;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function TabBar({ activeTab, onTabChange, assessment, t }: TabBarProps) {
  // Domains with blocked items get a red dot
  const domainsWithBlockers = useMemo(() => {
    const set = new Set<string>();
    for (const domain of assessment.domains) {
      if (domain.stats.blocked > 0) {
        set.add(domain.id);
      }
    }
    return set;
  }, [assessment.domains]);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-px border-b border-slate-200" role="tablist">
      {ALL_TABS.map((tabId) => {
        const isActive = activeTab === tabId;
        const hasBlocker = tabId !== 'overview' && domainsWithBlockers.has(tabId);

        return (
          <button
            key={tabId}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tabId}`}
            onClick={() => onTabChange(tabId)}
            className={`
              relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap
              border-b-2 transition-colors
              ${isActive
                ? 'border-violet-500 text-violet-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
            `}
          >
            {t(`assessment.tabs.${tabId}`)}
            {hasBlocker && (
              <span
                className="w-2 h-2 rounded-full bg-red-500 shrink-0"
                aria-label="has blockers"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Content Placeholder
// ---------------------------------------------------------------------------

interface TabContentProps {
  tabId: TabId;
  assessment: AssessmentData;
  onTabChange: (tab: TabId) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function TabContent({ tabId, assessment, onTabChange, t }: TabContentProps) {
  return (
    <div
      id={`tabpanel-${tabId}`}
      role="tabpanel"
      aria-labelledby={`tab-${tabId}`}
      className="py-6"
    >
      {tabId === 'overview' ? (
        <OverviewTab
          assessment={assessment}
          onDomainClick={(domainId) => onTabChange(domainId)}
          t={t}
        />
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">
            {t(`assessment.tabs.${tabId}`)} — content coming in next tasks
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabId) || 'overview';

  const assessment = useMemo(() => {
    if (!id) return null;
    return getMockAssessmentData(id);
  }, [id]);

  const handleTabChange = useCallback(
    (tab: TabId) => {
      setSearchParams({ tab });
    },
    [setSearchParams],
  );

  if (!id) return null;

  // Full assessment workspace
  if (assessment) {
    const currentRun = assessment.runs[assessment.currentRunIndex];
    const timeAgo = formatTimeAgo(currentRun.completedAt);

    return (
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {t('assessment.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('assessment.header.runInfo', { number: currentRun.number, timeAgo })}
            </p>
          </div>
          <button
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            {t('assessment.header.export')}
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Tab Bar */}
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          assessment={assessment}
          t={t}
        />

        {/* Tab Content */}
        <TabContent
          tabId={activeTab}
          assessment={assessment}
          onTabChange={handleTabChange}
          t={t}
        />
      </div>
    );
  }

  // Empty state — no assessment data
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
