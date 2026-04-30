/**
 * Assessment Page
 *
 * Multi-tab assessment workspace replacing the traditional 100-page PDF.
 * Shows migration readiness assessment results or contextual empty state.
 */
import { useMemo, useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, ChevronDown, Loader2, Lock } from 'lucide-react';
import { getMockAssessmentData, DOMAIN_TAB_ORDER } from '../../mocks/assessment-mock-data';
import type { DomainId, AssessmentData } from '../../mocks/assessment-mock-data';
import OverviewTab from '../../components/assessment/OverviewTab';
import DomainTabWrapper from '../../components/assessment/DomainTabWrapper';
import ItemDetailPanel from '../../components/assessment/ItemDetailPanel';
import { RunSelector } from '../../components/assessment/RunDelta';
import ChatStub from '../../components/assessment/ChatStub';
import IRNodeCountBadge from '../../components/assessment/IRNodeCountBadge';
import type { AssessmentItem } from '../../mocks/assessment-mock-data';
import {
  useAssessmentStatus,
  useStartAssessmentRun,
  useAssessmentFindings,
  useGenerateReport,
} from '../../hooks/use-assessment-run';
import { transformFindingsToAssessmentData } from '../../utils/transform-api-findings';
import { useAssessmentEntitlement } from '@/features/billing/hooks/use-assessment-entitlement';
import { AssessmentPaywall } from '@/features/billing/components/AssessmentPaywall';

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type TabId = 'overview' | DomainId;

const ALL_TABS: TabId[] = ['overview', ...DOMAIN_TAB_ORDER];

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  assessment: AssessmentData;
  isLocked?: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function TabBar({ activeTab, onTabChange, assessment, isLocked, t }: TabBarProps) {
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
    <div
      className="flex items-center gap-1 overflow-x-auto pb-px border-b border-slate-200"
      role="tablist"
    >
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
              ${
                isActive
                  ? 'border-violet-500 text-violet-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }
            `}
          >
            {t(`assessment.tabs.${tabId}`)}
            {isLocked && tabId !== 'overview' && <Lock className="h-3 w-3 text-slate-400 ms-1" />}
            {hasBlocker && !isLocked && (
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
  entitlement?: ReturnType<typeof useAssessmentEntitlement>;
  onTabChange: (tab: TabId) => void;
  onItemClick?: (itemId: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function TabContent({
  tabId,
  assessment,
  entitlement,
  onTabChange,
  onItemClick,
  t,
}: TabContentProps) {
  const content =
    tabId === 'overview' ? (
      <OverviewTab
        assessment={assessment}
        onDomainClick={(domainId) => onTabChange(domainId)}
        t={t}
      />
    ) : (
      <DomainTabWrapper
        domainId={tabId as DomainId}
        assessment={assessment}
        onItemClick={onItemClick}
        t={t}
      />
    );

  // Domain tabs are behind paywall; overview is always free
  if (tabId !== 'overview' && entitlement && !entitlement.isUnlocked && !entitlement.isLoading) {
    return (
      <div
        id={`tabpanel-${tabId}`}
        role="tabpanel"
        aria-labelledby={`tab-${tabId}`}
        className="py-6"
      >
        <AssessmentPaywall entitlement={entitlement}>{content}</AssessmentPaywall>
      </div>
    );
  }

  return (
    <div id={`tabpanel-${tabId}`} role="tabpanel" aria-labelledby={`tab-${tabId}`} className="py-6">
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabId) || 'overview';

  // API hooks — try real data first, fall back to mock
  const { data: apiStatus } = useAssessmentStatus(id);
  const startRun = useStartAssessmentRun(id);
  const completedRunId =
    apiStatus?.status === 'completed' || apiStatus?.status === 'completed_warnings'
      ? apiStatus.runId
      : undefined;
  const { data: findingsResult } = useAssessmentFindings(id, completedRunId);
  const generateReport = useGenerateReport(id);

  // Only use mock fallback in mock mode — staging/production should show real data or empty state
  const isMockMode = import.meta.env.VITE_AUTH_MODE === 'mock';

  const assessment = useMemo(() => {
    if (!id) return null;
    // Try API data first (from completed extraction run)
    if (findingsResult?.data && findingsResult.data.length > 10 && apiStatus) {
      const apiData = transformFindingsToAssessmentData(findingsResult.data, apiStatus);
      if (apiData) return apiData;
    }
    // In mock mode only: fall back to hardcoded mock data for dev/demo
    if (isMockMode) {
      return getMockAssessmentData(id);
    }
    // In staging/production: return null → shows empty state (not fake data)
    return null;
  }, [id, findingsResult, apiStatus, isMockMode]);

  const isRunActive = !!(
    apiStatus &&
    !['completed', 'completed_warnings', 'failed', 'cancelled'].includes(apiStatus.status)
  );

  const [selectedItem, setSelectedItem] = useState<AssessmentItem | null>(null);

  const handleTabChange = useCallback(
    (tab: TabId) => {
      setSearchParams({ tab });
    },
    [setSearchParams]
  );

  const handleItemClick = useCallback(
    (itemId: string) => {
      if (!assessment) return;
      for (const domain of assessment.domains) {
        const found = domain.items.find((i) => i.id === itemId);
        if (found) {
          setSelectedItem(found);
          return;
        }
      }
    },
    [assessment]
  );

  const entitlement = useAssessmentEntitlement(id);
  const isAssessmentLocked = !entitlement.isUnlocked && !entitlement.isLoading;

  if (!id) return null;

  // Full assessment workspace
  if (assessment) {
    return (
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{t('assessment.title')}</h1>
              <IRNodeCountBadge irNodeCount={apiStatus?.irNodeCount} />
            </div>
            <RunSelector
              runs={assessment.runs}
              currentIndex={assessment.currentRunIndex}
              onRunChange={() => {
                /* Run switching not implemented in mock */
              }}
              t={t}
            />
            {isRunActive && apiStatus && (
              <div className="mt-1 flex items-center gap-2 text-xs text-violet-600">
                <Loader2 size={12} className="animate-spin" />
                <span>
                  Extraction {apiStatus.status}... {apiStatus.completenessPct ?? 0}%
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startRun.mutate()}
              disabled={startRun.isPending || isRunActive}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {startRun.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {t('assessment.header.rerun', { defaultValue: 'Re-Extract' })}
            </button>
            <button
              onClick={() => {
                if (isAssessmentLocked) return;
                if (completedRunId) generateReport.mutate(completedRunId);
              }}
              disabled={!completedRunId || generateReport.isPending || isAssessmentLocked}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="export-report-btn"
              title={
                isAssessmentLocked
                  ? t('billing:paywall.exportLocked', {
                      defaultValue: 'Unlock full assessment to download report',
                    })
                  : undefined
              }
            >
              {isAssessmentLocked ? (
                <Lock size={14} className="text-slate-400" />
              ) : generateReport.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : null}
              {generateReport.isSuccess
                ? t('assessment.header.reportDownloaded', { defaultValue: 'Downloaded' })
                : t('assessment.header.export')}
              {!generateReport.isPending && !generateReport.isSuccess && !isAssessmentLocked && (
                <ChevronDown size={14} />
              )}
            </button>
            {generateReport.isError && (
              <span className="text-xs text-red-500">
                {generateReport.error instanceof Error
                  ? generateReport.error.message
                  : 'Report generation failed'}
              </span>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          assessment={assessment}
          isLocked={isAssessmentLocked}
          t={t}
        />

        {/* Tab Content */}
        <TabContent
          tabId={activeTab}
          assessment={assessment}
          entitlement={entitlement}
          onTabChange={handleTabChange}
          onItemClick={handleItemClick}
          t={t}
        />

        {/* Chat UI Stub */}
        <ChatStub />

        {/* Item Detail Slide-Over */}
        <ItemDetailPanel
          item={selectedItem}
          assessment={assessment}
          onClose={() => setSelectedItem(null)}
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
          onClick={() => {
            startRun.mutate();
          }}
          disabled={startRun.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          aria-label={t('workspace.placeholder.assessment.cta')}
        >
          {startRun.isPending && <Loader2 size={14} className="animate-spin" />}
          {t('workspace.placeholder.assessment.cta')}
        </button>
        {startRun.error && (
          <p className="text-xs text-red-500 mt-2">
            {startRun.error instanceof Error
              ? startRun.error.message
              : 'Failed to start extraction'}
          </p>
        )}
        <p className="text-xs text-slate-400 mt-4">
          {t('workspace.placeholder.assessment.locked')}
        </p>
      </div>
    </div>
  );
}
