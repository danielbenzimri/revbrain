/**
 * Domain Tab Wrapper
 *
 * Maps each domain ID to the appropriate stat cards and renders
 * the DomainTab template. Handles sub-tab routing.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import DomainTab from './DomainTab';
import type { DomainData, DomainId, AssessmentData } from '../../mocks/assessment-mock-data';
import {
  CodeWaterfall,
  ReportFreshness,
  SubscriptionCard,
  TwinFieldMatrix,
  GuidedSellingCards,
} from './visualizations';

// ---------------------------------------------------------------------------
// Stat card config per domain
// ---------------------------------------------------------------------------

function getStatCards(domain: DomainData, t: (key: string) => string) {
  const s = domain.stats;

  switch (domain.id as DomainId) {
    case 'products':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        {
          label: t('assessment.subTabs.guidedSelling'),
          value: domain.guidedSellingFlows?.length ?? 0,
        },
        {
          label: t('assessment.subTabs.qleCustomizations'),
          value: domain.qleCustomizations?.length ?? 0,
        },
      ];
    case 'pricing':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        { label: 'With Apex', value: domain.items.filter((i) => i.linesOfCode).length },
        {
          label: 'Calc Plugins',
          value: domain.items.filter((i) => i.apiName.includes('CustomScript')).length,
        },
      ];
    case 'rules':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        { label: t('assessment.migrationStatus.auto'), value: s.auto },
        { label: t('assessment.migrationStatus.blocked'), value: s.blocked },
      ];
    case 'code':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.table.linesOfCode'), value: '4,200+' },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        {
          label: t('assessment.subTabs.securityPermissions'),
          value: domain.permissionSets?.length ?? 0,
        },
      ];
    case 'integrations':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        {
          label: t('assessment.subTabs.packageDependencies'),
          value: domain.packageDependencies?.length ?? 0,
        },
        { label: t('assessment.migrationStatus.manual'), value: s.manual },
      ];
    case 'amendments':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        { label: 'MDQ Products', value: domain.subscriptionManagement?.mdqProductCount ?? 0 },
        { label: t('assessment.migrationStatus.blocked'), value: s.blocked },
      ];
    case 'approvals':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        { label: t('assessment.migrationStatus.auto'), value: s.auto },
        { label: t('assessment.migrationStatus.guided'), value: s.guided },
      ];
    case 'documents':
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: 'Merge Fields', value: 42 },
        { label: 'Conditional Sections', value: 12 },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
      ];
    case 'dataReporting':
      return [
        { label: 'Reports', value: domain.reports?.filter((r) => r.type === 'report').length ?? 0 },
        {
          label: 'Dashboards',
          value: domain.reports?.filter((r) => r.type === 'dashboard').length ?? 0,
        },
        {
          label: 'CPQ-Referencing',
          value: domain.reports?.filter((r) => r.referencesCpq).length ?? 0,
        },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
      ];
    default:
      return [
        { label: t('assessment.table.items'), value: s.total },
        { label: t('assessment.complexity.high'), value: s.highComplexity },
        { label: t('assessment.migrationStatus.auto'), value: s.auto },
        { label: t('assessment.migrationStatus.manual'), value: s.manual },
      ];
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DomainTabWrapperProps {
  domainId: DomainId;
  assessment: AssessmentData;
  onItemClick?: (itemId: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function DomainTabWrapper({
  domainId,
  assessment,
  onItemClick,
  t,
}: DomainTabWrapperProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const domain = assessment.domains.find((d) => d.id === domainId);

  const activeSubTab = searchParams.get('sub') || undefined;

  const handleSubTabChange = useCallback(
    (subTabId: string) => {
      setSearchParams({ tab: domainId, sub: subTabId });
    },
    [domainId, setSearchParams]
  );

  if (!domain) return null;

  const statCards = getStatCards(domain, t);
  const currentSub = activeSubTab || (domain.subTabs.length > 0 ? domain.subTabs[0].id : '');

  // Render domain-specific visualizations for certain sub-tabs
  const renderSubTabContent = () => {
    // Products sub-tab visualizations
    if (domainId === 'products' && currentSub === 'guided-selling' && domain.guidedSellingFlows) {
      return <GuidedSellingCards flows={domain.guidedSellingFlows} t={t} />;
    }
    if (domainId === 'products' && currentSub === 'twin-fields' && domain.twinFields) {
      return <TwinFieldMatrix pairs={domain.twinFields} t={t} />;
    }

    // Amendments sub-tab visualizations
    if (
      domainId === 'amendments' &&
      currentSub === 'subscription-management' &&
      domain.subscriptionManagement
    ) {
      return <SubscriptionCard data={domain.subscriptionManagement} t={t} />;
    }

    // Code domain: waterfall is shown as extra content, not replacement
    // (handled below via extraContent, not children)

    return undefined; // Use default inventory table
  };

  const subTabContent = renderSubTabContent();

  // Extra visualizations rendered above the domain tab (not replacing inventory)
  const showCodeWaterfall = domainId === 'code' && (!currentSub || currentSub === 'code-inventory');
  const showReportFreshness =
    domainId === 'dataReporting' && currentSub === 'reports-dashboards' && domain.reports;

  return (
    <div className="space-y-4">
      {/* Extra domain-specific visualizations (above the domain tab) */}
      {showCodeWaterfall && <CodeWaterfall items={domain.items} t={t} />}
      {showReportFreshness && domain.reports && <ReportFreshness reports={domain.reports} t={t} />}

      <DomainTab
        domain={domain}
        statCards={statCards}
        onItemClick={onItemClick}
        onSubTabChange={handleSubTabChange}
        activeSubTab={activeSubTab}
        t={t}
      >
        {subTabContent}
      </DomainTab>
    </div>
  );
}
