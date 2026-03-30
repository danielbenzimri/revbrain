/**
 * Assessment Mock Data
 *
 * Rich, realistic assessment data for the Q1 Migration project representing
 * a complex enterprise CPQ org (694 items across 9 domains).
 *
 * Used by the Assessment workspace UI in mock mode.
 */
import { MOCK_IDS } from '@/lib/mock-ids';

// ---------------------------------------------------------------------------
// Enums & Types
// ---------------------------------------------------------------------------

export type MigrationStatus = 'auto' | 'guided' | 'manual' | 'blocked';
export type Complexity = 'low' | 'moderate' | 'high';
export type TriageState = 'untriaged' | 'in_scope' | 'excluded' | 'needs_discussion';
export type RiskCategory = 'technical' | 'business' | 'timeline' | 'organizational';
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export type DomainId =
  | 'products'
  | 'pricing'
  | 'rules'
  | 'code'
  | 'integrations'
  | 'amendments'
  | 'approvals'
  | 'documents'
  | 'dataReporting';

export interface SubTab {
  id: string;
  labelKey: string;
  itemCount: number;
}

export interface DomainStats {
  total: number;
  auto: number;
  guided: number;
  manual: number;
  blocked: number;
  highComplexity: number;
}

export interface AssessmentItem {
  id: string;
  name: string;
  apiName: string;
  complexity: Complexity;
  migrationStatus: MigrationStatus;
  triageState: TriageState;
  rcaTarget: string | null;
  rcaTooltip: string | null;
  whyStatus: string;
  aiDescription: string;
  dependencies: string[];
  isActive: boolean;
  lastModified: string;
  linesOfCode: number | null;
  estimatedHours: number | null;
}

export interface AssessmentRisk {
  id: string;
  description: string;
  category: RiskCategory;
  severity: RiskSeverity;
  likelihood: number; // 1-5
  impact: number; // 1-5
  affectedItems: string[];
  affectedDomains: DomainId[];
  mitigation: string;
  owner: string | null;
}

export interface KeyFinding {
  id: string;
  text: string;
  severity: 'success' | 'warning' | 'error';
  domain: DomainId | null;
}

export interface AssessmentRun {
  id: string;
  number: number;
  completedAt: string;
  itemsScanned: number;
  duration: number; // seconds
}

export interface RunDelta {
  added: number;
  removed: number;
  changed: number;
  details: Array<{
    text: string;
    type: 'added' | 'removed' | 'changed' | 'unchanged';
  }>;
}

export interface OrgHealth {
  edition: string;
  apiUsagePercent: number;
  storageUsagePercent: number;
  apexGovernorPercent: number;
  cpqLicenseCount: number;
  rcaLicenseCount: number;
  hasSalesforceBilling: boolean;
  billingObjectCount: number;
}

export interface CompletenessItem {
  id: string;
  labelKey: string;
  completed: boolean;
}

export interface GuidedSellingFlow {
  id: string;
  name: string;
  stepCount: number;
  inputFields: number;
  outputProducts: number;
  hasBranching: boolean;
  rcaApproach: string;
}

export interface QleCustomization {
  id: string;
  name: string;
  type: 'custom_column' | 'custom_button' | 'javascript' | 'plugin' | 'page_layout';
  description: string;
  migrationStatus: MigrationStatus;
}

export interface TwinFieldPair {
  id: string;
  sourceObject: string;
  sourceField: string;
  targetObject: string;
  targetField: string;
  syncDirection: 'unidirectional' | 'bidirectional';
  rcaApproach: string;
}

export interface ContractedPricingSummary {
  totalRecords: number;
  accountCount: number;
  expiredCount: number;
  expiringNext90Days: number;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  isDefault: boolean;
  conversionRate: number;
  useDatedRates: boolean;
}

export interface ReportDashboardItem {
  id: string;
  name: string;
  type: 'report' | 'dashboard';
  folder: string;
  lastRunDate: string | null;
  referencesCpq: boolean;
  cpqObjectsReferenced: string[];
}

export interface PermissionSetInfo {
  id: string;
  name: string;
  cpqFieldCount: number;
  assignedUserCount: number;
}

export interface PackageDependency {
  id: string;
  name: string;
  namespace: string;
  version: string;
  referencesCpqObjects: boolean;
  cpqObjectReferences: string[];
}

export interface SubscriptionManagement {
  hasCoTermination: boolean;
  coTerminationBasis: string | null;
  hasMdq: boolean;
  mdqProductCount: number;
  prorationMethod: string;
  hasEvergreen: boolean;
  hasUplift: boolean;
  upliftDefaultPercent: number | null;
}

export interface DomainData {
  id: DomainId;
  labelKey: string;
  complexity: Complexity;
  stats: DomainStats;
  items: AssessmentItem[];
  insights: string[];
  subTabs: SubTab[];
  // Sub-tab-specific data
  guidedSellingFlows?: GuidedSellingFlow[];
  qleCustomizations?: QleCustomization[];
  twinFields?: TwinFieldPair[];
  contractedPricing?: ContractedPricingSummary;
  currencies?: CurrencyInfo[];
  reports?: ReportDashboardItem[];
  permissionSets?: PermissionSetInfo[];
  packageDependencies?: PackageDependency[];
  subscriptionManagement?: SubscriptionManagement;
  orgHealth?: OrgHealth;
}

// CPQ Intelligence section types (from gap analysis mitigations)
export interface CPQSettingItem {
  setting: string;
  value: string;
  fieldRef: string;
  notes: string;
}

export interface PluginItem {
  plugin: string;
  status: string;
  notes: string;
}

export interface UserBehaviorItem {
  profile: string;
  users: number;
  notes: string;
  evidenceRefs: Array<{ type: string; value: string; label: string }>;
}

export interface ConversionSegmentItem {
  segment: string;
  quoteCount: number;
  notes: string;
  evidenceRefs: Array<{ type: string; value: string; label: string }>;
}

export interface DataQualityFlagItem {
  check: string;
  count: number | null;
  status: string;
  notes: string;
}

export interface TopProductItem {
  name: string;
  productId: string;
  quotedCount: number;
  notes: string;
  evidenceRefs: Array<{ type: string; value: string; label: string }>;
}

export interface ComplexityHotspotItem {
  name: string;
  severity: string;
  analysis: string;
  evidenceRefs: Array<{ type: string; value: string; label: string }>;
}

export interface AssessmentData {
  projectId: string;
  domains: DomainData[];
  risks: AssessmentRisk[];
  keyFindings: KeyFinding[];
  runs: AssessmentRun[];
  currentRunIndex: number;
  runDelta: RunDelta;
  orgHealth: OrgHealth;
  completeness: CompletenessItem[];
  totalItems: number;
  totalAuto: number;
  totalGuided: number;
  totalManual: number;
  totalBlocked: number;
  // CPQ Intelligence sections (optional — populated by gap analysis mitigations)
  settingsPanel?: CPQSettingItem[];
  pluginInventory?: PluginItem[];
  userBehavior?: UserBehaviorItem[];
  discountDistribution?: {
    totalDiscounted: number;
    avgPercent: number;
    buckets: Array<{ range: string; count: number }>;
  } | null;
  priceOverrides?: { count: number; notes: string; evidenceRefs: unknown[] } | null;
  topProducts?: TopProductItem[];
  conversionSegments?: ConversionSegmentItem[];
  trendIndicators?: Array<{ metric: string; notes: string; evidenceRefs: unknown[] }>;
  dataQualityFlags?: DataQualityFlagItem[];
  complexityHotspots?: ComplexityHotspotItem[];
  objectInventory?: Array<{
    id: number;
    objectName: string;
    count: number;
    complexity: string;
    notes: string;
  }>;
  cpqReports?: Array<{ name: string; notes: string }>;
  userAdoption?: {
    licenses: string | null;
    activeCreators: string | null;
    profileCount: string | null;
    notes: string;
  } | null;
  totalEstimatedHours?: number;
  // V3 PDF parity fields
  permissionSets?: Array<{ name: string; type: string }>;
  featureUtilization?: Array<{ feature: string; status: string; detail: string }>;
  dormantFamilies?: Array<{ name: string; productCount: number }>;
  discountScheduleDedup?: {
    totalCount: number;
    uniqueCount: number;
    duplicateDetail: string;
  };
  lowVolumeWarning?: string | null;
  scoringMethodology?: Array<{
    dimension: string;
    weight: number;
    score: number;
    drivers: string;
    rationale: string;
  }>;
  complexityScores?: {
    overall: number;
    configurationDepth: number;
    pricingLogic: number;
    customizationLevel: number;
    dataVolumeUsage: number;
    technicalDebt: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}-${String(idCounter).padStart(4, '0')}`;
}

function makeItem(
  overrides: Partial<AssessmentItem> &
    Pick<
      AssessmentItem,
      | 'name'
      | 'apiName'
      | 'complexity'
      | 'migrationStatus'
      | 'rcaTarget'
      | 'whyStatus'
      | 'aiDescription'
    >
): AssessmentItem {
  return {
    id: nextId('item'),
    triageState: 'untriaged',
    rcaTooltip: null,
    dependencies: [],
    isActive: true,
    lastModified: daysAgo(Math.floor(Math.random() * 90) + 10),
    linesOfCode: null,
    estimatedHours: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Domain Data Builders
// ---------------------------------------------------------------------------

function buildProductsDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'Enterprise Server Bundle',
      apiName: 'SBQQ__Product2__c:ENT-SRV-BDL',
      complexity: 'high',
      migrationStatus: 'guided',
      rcaTarget: 'Product Selling Model',
      rcaTooltip:
        'Maps to PSM with nested Product Selling Model Items. Bundle depth of 4 requires flattening.',
      whyStatus:
        'Bundle nesting depth exceeds 3 levels — requires restructuring as Product Selling Model.',
      aiDescription:
        'Enterprise server hardware bundle with 12 required components, 8 optional add-ons, and 3 mutually exclusive feature groups. Includes dynamic option constraints based on server chassis selection.',
      dependencies: ['Enterprise Chassis Option', 'Server Memory Config', 'Volume Discount Rule'],
    }),
    makeItem({
      name: 'Cloud Platform License',
      apiName: 'SBQQ__Product2__c:CLD-PLT-LIC',
      complexity: 'low',
      migrationStatus: 'auto',
      rcaTarget: 'Product Selling Model',
      whyStatus: 'Standard product with direct RCA mapping.',
      aiDescription:
        'Standalone subscription license for cloud platform access. Annual term, per-user pricing. No bundle dependencies.',
    }),
    makeItem({
      name: 'Professional Services Package',
      apiName: 'SBQQ__Product2__c:PS-PKG-001',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Product Selling Model',
      whyStatus: 'Product options use custom visibility rules that need manual review in RCA.',
      aiDescription:
        'Services bundle with T&M and fixed-price options. Includes dynamic scoping questionnaire that adjusts deliverables. 5 option constraints, 2 feature groups.',
      dependencies: ['PS Scoping Flow', 'T&M Rate Card'],
    }),
    makeItem({
      name: 'Data Migration Add-on',
      apiName: 'SBQQ__Product2__c:DATA-MIG-001',
      complexity: 'low',
      migrationStatus: 'auto',
      rcaTarget: 'Product Selling Model',
      whyStatus: 'Simple product with direct mapping.',
      aiDescription:
        'One-time service add-on for data migration assistance. Fixed price, no configuration dependencies.',
    }),
    makeItem({
      name: 'Premium Support Tier',
      apiName: 'SBQQ__Product2__c:SUP-PREM-001',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Product Selling Model',
      whyStatus: 'Subscription term logic uses custom Apex for co-termination alignment.',
      aiDescription:
        'Subscription product for premium 24/7 support. Co-terminates with primary license. Includes SLA metrics and escalation rules.',
      dependencies: ['Co-term Alignment Class'],
    }),
    makeItem({
      name: 'DealOptimizer Widget',
      apiName: 'SBQQ__Product2__c:DEAL-OPT-001',
      complexity: 'high',
      migrationStatus: 'blocked',
      rcaTarget: null,
      whyStatus:
        'Custom QLE component with no RCA equivalent. Requires full rebuild in OmniStudio.',
      aiDescription:
        'Custom Quote Line Editor widget that analyzes deal profitability in real-time and suggests optimal configurations. Uses 3 Apex callouts and custom JavaScript.',
      dependencies: ['DealOptimizer.cls', 'QLE Plugin: DealOpt'],
    }),
  ];

  return {
    id: 'products',
    labelKey: 'assessment.tabs.products',
    complexity: 'moderate',
    stats: { total: 187, auto: 120, guided: 45, manual: 18, blocked: 4, highComplexity: 23 },
    items,
    insights: [
      'assessment.insights.products.bundleDepth',
      'assessment.insights.products.inactiveProducts',
      'assessment.insights.products.qleWidgets',
    ],
    subTabs: [
      { id: 'catalog', labelKey: 'assessment.subTabs.catalog', itemCount: 187 },
      { id: 'guided-selling', labelKey: 'assessment.subTabs.guidedSelling', itemCount: 4 },
      { id: 'qle-customizations', labelKey: 'assessment.subTabs.qleCustomizations', itemCount: 12 },
      { id: 'twin-fields', labelKey: 'assessment.subTabs.twinFields', itemCount: 18 },
    ],
    guidedSellingFlows: [
      {
        id: 'gs-1',
        name: 'New Business Server Config',
        stepCount: 6,
        inputFields: 12,
        outputProducts: 8,
        hasBranching: true,
        rcaApproach: 'Rebuild as OmniScript with FlexCards',
      },
      {
        id: 'gs-2',
        name: 'Cloud License Selector',
        stepCount: 3,
        inputFields: 5,
        outputProducts: 3,
        hasBranching: false,
        rcaApproach: 'Rebuild as OmniScript',
      },
      {
        id: 'gs-3',
        name: 'Support Tier Advisor',
        stepCount: 4,
        inputFields: 8,
        outputProducts: 4,
        hasBranching: true,
        rcaApproach: 'Rebuild as OmniScript with DataRaptors',
      },
      {
        id: 'gs-4',
        name: 'Renewal Configuration Wizard',
        stepCount: 5,
        inputFields: 10,
        outputProducts: 6,
        hasBranching: true,
        rcaApproach: 'Rebuild as OmniScript — complex branching requires custom LWC steps',
      },
    ],
    qleCustomizations: [
      {
        id: 'qle-1',
        name: 'Deal Profitability Column',
        type: 'custom_column',
        description: 'Calculates and displays real-time margin % for each quote line',
        migrationStatus: 'manual',
      },
      {
        id: 'qle-2',
        name: 'Quick Add from Favorites',
        type: 'custom_button',
        description: 'Button that adds frequently-ordered products from user favorites list',
        migrationStatus: 'manual',
      },
      {
        id: 'qle-3',
        name: 'Line Item Reorder Script',
        type: 'javascript',
        description: 'Custom JavaScript enabling drag-and-drop reordering of quote lines',
        migrationStatus: 'blocked',
      },
      {
        id: 'qle-4',
        name: 'DealOptimizer Plugin',
        type: 'plugin',
        description: 'QLE plugin that analyzes quote and suggests optimal product combinations',
        migrationStatus: 'blocked',
      },
    ],
    twinFields: [
      {
        id: 'tf-1',
        sourceObject: 'SBQQ__Quote__c',
        sourceField: 'Region__c',
        targetObject: 'Opportunity',
        targetField: 'Region__c',
        syncDirection: 'bidirectional',
        rcaApproach: 'Flow-based field sync',
      },
      {
        id: 'tf-2',
        sourceObject: 'SBQQ__Quote__c',
        sourceField: 'Deal_Type__c',
        targetObject: 'Opportunity',
        targetField: 'Deal_Type__c',
        syncDirection: 'unidirectional',
        rcaApproach: 'Flow-based field sync',
      },
      {
        id: 'tf-3',
        sourceObject: 'SBQQ__QuoteLine__c',
        sourceField: 'Custom_Discount__c',
        targetObject: 'OrderItem',
        targetField: 'Custom_Discount__c',
        syncDirection: 'unidirectional',
        rcaApproach: 'Order management mapping rule',
      },
      {
        id: 'tf-4',
        sourceObject: 'SBQQ__Quote__c',
        sourceField: 'Approval_Status__c',
        targetObject: 'Opportunity',
        targetField: 'Approval_Status__c',
        syncDirection: 'unidirectional',
        rcaApproach: 'Flow-based field sync',
      },
      {
        id: 'tf-5',
        sourceObject: 'SBQQ__QuoteLine__c',
        sourceField: 'Margin_Pct__c',
        targetObject: 'OpportunityLineItem',
        targetField: 'Margin_Pct__c',
        syncDirection: 'unidirectional',
        rcaApproach: 'Pricing procedure output mapping',
      },
    ],
  };
}

function buildPricingDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'Enterprise Volume Discount',
      apiName: 'SBQQ__PriceRule__c:ENT-VOL-DISC',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Pricing Procedure',
      rcaTooltip:
        'Maps to Pricing Procedure with custom Pricing Procedure Steps. Apex dependency must be rewritten.',
      whyStatus:
        'Relies on Apex class VolumeCalc.cls which cannot be auto-mapped to Pricing Procedures.',
      aiDescription:
        'If the customer is in EMEA and orders more than 100 units of any Hardware product, apply a 15% volume discount on the entire quote line group.',
      dependencies: ['VolumeCalc.cls', 'Quote Line Trigger', 'Enterprise Product Bundle'],
      linesOfCode: 89,
    }),
    makeItem({
      name: 'Partner Tier Pricing',
      apiName: 'SBQQ__PriceRule__c:PTR-TIER',
      complexity: 'high',
      migrationStatus: 'guided',
      rcaTarget: 'Pricing Procedure',
      whyStatus:
        'Uses lookup-based pricing that requires redesign as Pricing Procedure context definitions.',
      aiDescription:
        'Applies partner-specific pricing tiers based on partner level (Silver/Gold/Platinum). Looks up discount percentage from a custom pricing matrix object.',
      dependencies: ['Partner_Pricing_Matrix__c', 'PartnerTierLookup.cls'],
      linesOfCode: 142,
    }),
    makeItem({
      name: 'Geo-based Markup',
      apiName: 'SBQQ__PriceRule__c:GEO-MARKUP',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Pricing Procedure',
      whyStatus: 'Standard price rule pattern but uses SOQL lookup for region determination.',
      aiDescription:
        'Adds a regional markup (5-15%) based on the shipping country of the quote. Uses a custom region-to-markup mapping table.',
      dependencies: ['Region_Markup__c'],
    }),
    makeItem({
      name: 'Standard List Price Rule',
      apiName: 'SBQQ__PriceRule__c:STD-LIST',
      complexity: 'low',
      migrationStatus: 'auto',
      rcaTarget: 'Pricing Procedure',
      whyStatus: 'Standard price rule with direct RCA Pricing Procedure mapping.',
      aiDescription:
        'Sets the list price for standard products from the default price book. No custom logic, no conditions.',
    }),
    makeItem({
      name: 'Multi-Year Discount Schedule',
      apiName: 'SBQQ__DiscountSchedule__c:MY-DISC',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Pricing Procedure',
      whyStatus:
        'Discount schedule tiers map to Pricing Procedure steps but require manual tier configuration.',
      aiDescription:
        'Applies progressive discounts based on subscription term length: 1yr=0%, 2yr=5%, 3yr=10%, 5yr=15%. Applies to all subscription products.',
    }),
    makeItem({
      name: 'QCP: onBeforeCalculate',
      apiName: 'SBQQ__CustomScript__c:QCP-BEFORE',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Pricing Procedure + Custom Apex',
      whyStatus:
        'QCP JavaScript with external callout cannot be converted to declarative Pricing Procedure.',
      aiDescription:
        'Custom Quote Calculator Plugin that runs before price calculation. Makes an external API callout to the ERP system to fetch real-time cost data, then adjusts margins dynamically. 142 lines of JavaScript.',
      dependencies: ['ERP Integration API', 'CostSync Integration'],
      linesOfCode: 142,
    }),
    makeItem({
      name: 'Seasonal Promotion Engine',
      apiName: 'SBQQ__PriceRule__c:SEASON-PROMO',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Pricing Procedure',
      whyStatus:
        'Date-based conditional logic requires manual Pricing Procedure step configuration.',
      aiDescription:
        'Applies seasonal promotional discounts based on quote creation date. Q4 gets 10% off hardware, Q1 gets 5% off services. Uses date ranges defined in a custom settings object.',
      dependencies: ['Seasonal_Promo_Settings__c'],
    }),
  ];

  return {
    id: 'pricing',
    labelKey: 'assessment.tabs.pricing',
    complexity: 'high',
    stats: { total: 243, auto: 82, guided: 100, manual: 58, blocked: 3, highComplexity: 47 },
    items,
    insights: [
      'assessment.insights.pricing.highComplexity',
      'assessment.insights.pricing.apexDependencies',
      'assessment.insights.pricing.inactiveRules',
    ],
    subTabs: [
      { id: 'price-rules', labelKey: 'assessment.subTabs.priceRules', itemCount: 243 },
      {
        id: 'contracted-pricing',
        labelKey: 'assessment.subTabs.contractedPricing',
        itemCount: 340,
      },
      { id: 'multi-currency', labelKey: 'assessment.subTabs.multiCurrency', itemCount: 4 },
    ],
    contractedPricing: {
      totalRecords: 340,
      accountCount: 45,
      expiredCount: 89,
      expiringNext90Days: 12,
    },
    currencies: [
      {
        code: 'USD',
        name: 'US Dollar',
        isDefault: true,
        conversionRate: 1.0,
        useDatedRates: false,
      },
      { code: 'EUR', name: 'Euro', isDefault: false, conversionRate: 0.92, useDatedRates: true },
      {
        code: 'GBP',
        name: 'British Pound',
        isDefault: false,
        conversionRate: 0.79,
        useDatedRates: true,
      },
      {
        code: 'JPY',
        name: 'Japanese Yen',
        isDefault: false,
        conversionRate: 149.5,
        useDatedRates: false,
      },
    ],
  };
}

function buildRulesDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'Hardware Compatibility Check',
      apiName: 'SBQQ__ProductRule__c:HW-COMPAT',
      complexity: 'high',
      migrationStatus: 'guided',
      rcaTarget: 'Product Qualification Rule',
      whyStatus:
        'Complex multi-condition validation with 8 error conditions — requires manual rule decomposition.',
      aiDescription:
        'Prevents incompatible hardware combinations from being quoted together. Checks server chassis against memory, storage, and NIC compatibility matrices. Fires on configuration change.',
      dependencies: ['Compatibility_Matrix__c', 'Enterprise Server Bundle'],
    }),
    makeItem({
      name: 'License Count Validator',
      apiName: 'SBQQ__ProductRule__c:LIC-COUNT',
      complexity: 'low',
      migrationStatus: 'auto',
      rcaTarget: 'Product Qualification Rule',
      whyStatus: 'Standard validation rule with direct RCA mapping.',
      aiDescription:
        'Ensures license quantity matches or exceeds the number of named users specified on the quote. Displays error message if count is insufficient.',
    }),
    makeItem({
      name: 'Minimum Order Value Alert',
      apiName: 'SBQQ__ProductRule__c:MIN-ORDER',
      complexity: 'low',
      migrationStatus: 'auto',
      rcaTarget: 'Product Qualification Rule',
      whyStatus: 'Simple threshold alert with direct mapping.',
      aiDescription:
        'Displays a warning (non-blocking) when the quote total is below $5,000 minimum order threshold for direct sales channel.',
    }),
    makeItem({
      name: 'Auto-Add Warranty',
      apiName: 'SBQQ__ProductRule__c:AUTO-WARRANTY',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Product Relationship Rule',
      whyStatus:
        'Selection rule auto-adding products requires Product Relationship Rule configuration.',
      aiDescription:
        'Automatically adds a 1-year standard warranty product when any hardware product is added to the quote. Quantity matches the hardware line item quantity.',
      dependencies: ['Standard Warranty Product'],
    }),
    makeItem({
      name: 'Discount Approval Threshold',
      apiName: 'SBQQ__ProductRule__c:DISC-THRESH',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Product Qualification Rule',
      whyStatus:
        'Uses summary variable for aggregate calculation — needs manual Pricing Procedure integration.',
      aiDescription:
        'Blocks the quote if any line item discount exceeds 25% without manager approval. Uses a summary variable to calculate the maximum discount across all lines.',
      dependencies: ['Max Discount Summary Variable', 'Approval Chain: Discount Override'],
    }),
  ];

  return {
    id: 'rules',
    labelKey: 'assessment.tabs.rules',
    complexity: 'high',
    stats: { total: 89, auto: 34, guided: 38, manual: 15, blocked: 2, highComplexity: 18 },
    items,
    insights: [
      'assessment.insights.rules.validationRules',
      'assessment.insights.rules.summaryVariables',
      'assessment.insights.rules.inactiveRules',
    ],
    subTabs: [],
  };
}

function buildCodeDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'VolumeCalc.cls',
      apiName: 'ApexClass:VolumeCalc',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Pricing Procedure Steps',
      whyStatus:
        'Custom Apex with CPQ-specific API calls — must be rewritten as declarative Pricing Procedure.',
      aiDescription:
        'Apex class implementing volume-based discount calculations. Queries order history, calculates cumulative volume, and applies tiered pricing. 89 lines, 3 SOQL queries, 1 DML operation.',
      dependencies: ['Enterprise Volume Discount', 'Order_History__c'],
      linesOfCode: 89,
    }),
    makeItem({
      name: 'QuoteLineTrigger',
      apiName: 'ApexTrigger:QuoteLineTrigger',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Flow / Trigger on RCA Objects',
      whyStatus: 'Trigger on SBQQ__QuoteLine__c — must be rewritten for RCA quote line objects.',
      aiDescription:
        'Before-insert and before-update trigger on Quote Lines. Validates field combinations, enforces business rules, and syncs twin fields. Calls VolumeCalc for pricing updates.',
      dependencies: ['VolumeCalc.cls', 'Twin Field: Custom_Discount__c'],
      linesOfCode: 234,
    }),
    makeItem({
      name: 'PartnerTierLookup.cls',
      apiName: 'ApexClass:PartnerTierLookup',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Context Definition + Data Lookup',
      whyStatus:
        'Lookup logic can be replaced with RCA Context Definitions but needs manual setup.',
      aiDescription:
        'Utility class that retrieves partner tier information and corresponding discount percentages from the Partner_Pricing_Matrix__c custom object. Used by Partner Tier Pricing rule.',
      dependencies: ['Partner Tier Pricing', 'Partner_Pricing_Matrix__c'],
      linesOfCode: 67,
    }),
    makeItem({
      name: 'CPQ Quote PDF Generator',
      apiName: 'ApexClass:QuotePDFGenerator',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'OmniStudio Document Generation',
      whyStatus: 'Custom Visualforce-based PDF generation must be rebuilt in OmniStudio DocGen.',
      aiDescription:
        'Generates branded PDF quotes using Visualforce rendering. Handles conditional sections, multi-currency formatting, and dynamic line item grouping. 412 lines including test class.',
      dependencies: ['Quote Template: Enterprise', 'Quote Template: Partner'],
      linesOfCode: 412,
    }),
    makeItem({
      name: 'CPQ Config Flow',
      apiName: 'Flow:CPQ_Product_Configuration',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'OmniScript / Flow',
      whyStatus: 'Flow references CPQ-specific objects — needs object reference updates for RCA.',
      aiDescription:
        'Screen flow that guides users through product configuration for complex bundles. 12 screens, 8 decision nodes, 4 Apex actions. Launched from the QLE.',
      dependencies: ['Enterprise Server Bundle', 'VolumeCalc.cls'],
    }),
    makeItem({
      name: 'Approval Email Template',
      apiName: 'ApexClass:ApprovalEmailHandler',
      complexity: 'low',
      migrationStatus: 'auto',
      rcaTarget: 'Email Template + Flow',
      whyStatus: 'Standard email handler with direct RCA equivalent.',
      aiDescription:
        'Handles formatting and sending of approval notification emails. Merges quote data into email template. Simple utility class.',
      linesOfCode: 45,
    }),
  ];

  return {
    id: 'code',
    labelKey: 'assessment.tabs.code',
    complexity: 'high',
    stats: { total: 112, auto: 12, guided: 55, manual: 42, blocked: 3, highComplexity: 34 },
    items,
    insights: [
      'assessment.insights.code.totalLoc',
      'assessment.insights.code.cpqDependencies',
      'assessment.insights.code.testCoverage',
    ],
    subTabs: [
      { id: 'code-inventory', labelKey: 'assessment.subTabs.codeInventory', itemCount: 112 },
      {
        id: 'security-permissions',
        labelKey: 'assessment.subTabs.securityPermissions',
        itemCount: 8,
      },
    ],
    permissionSets: [
      { id: 'ps-1', name: 'CPQ Sales User', cpqFieldCount: 42, assignedUserCount: 45 },
      { id: 'ps-2', name: 'CPQ Sales Manager', cpqFieldCount: 58, assignedUserCount: 8 },
      { id: 'ps-3', name: 'CPQ Admin', cpqFieldCount: 124, assignedUserCount: 3 },
    ],
  };
}

function buildIntegrationsDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'ERP Cost Sync (SAP)',
      apiName: 'Integration:ERP-SAP-COST',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Integration (object remapping)',
      whyStatus:
        'Integration references SBQQ__QuoteLine__c fields directly — requires field remapping to RCA objects.',
      aiDescription:
        'Real-time integration with SAP ERP to fetch product costs and update quote line cost fields. Uses MuleSoft middleware. Processes ~2,000 cost lookups/day.',
      dependencies: ['QCP: onBeforeCalculate', 'MuleSoft Middleware'],
    }),
    makeItem({
      name: 'DocuSign eSignature',
      apiName: 'Integration:DOCUSIGN',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Integration (object remapping)',
      whyStatus:
        'DocuSign managed package references CPQ Quote object — needs reconfiguration for RCA.',
      aiDescription:
        'Sends generated quote PDFs to DocuSign for electronic signature. Triggered by approval completion. Maps signer roles from quote contacts.',
      dependencies: ['CPQ Quote PDF Generator', 'Approval Chain: Final Approval'],
    }),
    makeItem({
      name: 'Salesforce-to-Salesforce Sync',
      apiName: 'Integration:SF2SF-SYNC',
      complexity: 'low',
      migrationStatus: 'auto',
      rcaTarget: 'Integration (no CPQ dependency)',
      whyStatus: 'Integration does not reference CPQ objects — no migration impact.',
      aiDescription:
        'Syncs account and contact data between two Salesforce orgs for the partner portal. No CPQ object references.',
    }),
    makeItem({
      name: 'Billing System Feed',
      apiName: 'Integration:BILLING-FEED',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Integration (object remapping)',
      whyStatus:
        'Extracts from SBQQ__Quote__c and SBQQ__QuoteLine__c — all field references must change to RCA objects.',
      aiDescription:
        'Nightly batch integration that pushes won quotes to the billing system for invoice generation. Extracts 15 fields from Quote and 22 fields from Quote Lines.',
      dependencies: ['Billing System API'],
    }),
  ];

  return {
    id: 'integrations',
    labelKey: 'assessment.tabs.integrations',
    complexity: 'moderate',
    stats: { total: 11, auto: 2, guided: 5, manual: 4, blocked: 0, highComplexity: 4 },
    items,
    insights: [
      'assessment.insights.integrations.cpqReferences',
      'assessment.insights.integrations.middleware',
    ],
    subTabs: [
      { id: 'external-systems', labelKey: 'assessment.subTabs.externalSystems', itemCount: 11 },
      {
        id: 'package-dependencies',
        labelKey: 'assessment.subTabs.packageDependencies',
        itemCount: 6,
      },
      { id: 'experience-cloud', labelKey: 'assessment.subTabs.experienceCloud', itemCount: 1 },
      { id: 'salesforce-billing', labelKey: 'assessment.subTabs.salesforceBilling', itemCount: 12 },
    ],
    packageDependencies: [
      {
        id: 'pkg-1',
        name: 'DocuSign for Salesforce',
        namespace: 'dsfs',
        version: '8.2.1',
        referencesCpqObjects: true,
        cpqObjectReferences: ['SBQQ__Quote__c', 'SBQQ__QuoteDocument__c'],
      },
      {
        id: 'pkg-2',
        name: 'Conga Composer',
        namespace: 'APXTConga4',
        version: '14.3',
        referencesCpqObjects: true,
        cpqObjectReferences: ['SBQQ__Quote__c', 'SBQQ__QuoteLine__c'],
      },
      {
        id: 'pkg-3',
        name: 'LeanData',
        namespace: 'LeanData',
        version: '22.1',
        referencesCpqObjects: false,
        cpqObjectReferences: [],
      },
      {
        id: 'pkg-4',
        name: 'Validity DemandTools',
        namespace: 'DemandTools',
        version: '5.8',
        referencesCpqObjects: false,
        cpqObjectReferences: [],
      },
    ],
  };
}

function buildAmendmentsDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'Mid-Term Amendment Flow',
      apiName: 'SBQQ__Quote__c:AMEND-MIDTERM',
      complexity: 'high',
      migrationStatus: 'guided',
      rcaTarget: 'RCA Amendment Process',
      whyStatus:
        'Amendment proration logic uses custom Apex — needs redesign for RCA amendment model.',
      aiDescription:
        'Handles mid-term contract amendments: adding seats, upgrading tiers, or adding new products. Custom proration calculates charges for remaining contract term.',
      dependencies: ['Proration Calculator.cls', 'Co-term Alignment Class'],
    }),
    makeItem({
      name: 'Auto-Renewal Process',
      apiName: 'SBQQ__Quote__c:RENEWAL-AUTO',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'RCA Renewal Process',
      whyStatus: 'Renewal opportunity creation uses CPQ-specific fields — needs RCA field mapping.',
      aiDescription:
        'Automatically generates renewal quotes 90 days before contract end. Applies 3% annual uplift to all subscription lines. Creates renewal opportunity and links to original contract.',
      dependencies: ['Annual Uplift Rule', 'Renewal Notification Flow'],
    }),
    makeItem({
      name: 'Cancellation with Refund Calc',
      apiName: 'SBQQ__Quote__c:CANCEL-REFUND',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Custom Apex + RCA Process',
      whyStatus: 'Custom refund calculation logic has no declarative RCA equivalent.',
      aiDescription:
        'Processes contract cancellations with prorated refund calculations. Handles partial cancellations (removing individual products) and full cancellations. Complex refund rules based on cancellation reason and time remaining.',
      dependencies: ['RefundCalculator.cls', 'Billing System Feed'],
      linesOfCode: 178,
    }),
    makeItem({
      name: 'Co-termination Alignment',
      apiName: 'ApexClass:CoTermAlignment',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'RCA Co-termination Config',
      whyStatus: 'RCA has native co-termination but configuration differs from CPQ approach.',
      aiDescription:
        'Aligns new subscription end dates to the master contract end date. Calculates prorated pricing for the stub period. Used by amendment and new business flows.',
      linesOfCode: 93,
    }),
  ];

  return {
    id: 'amendments',
    labelKey: 'assessment.tabs.amendments',
    complexity: 'high',
    stats: { total: 34, auto: 8, guided: 14, manual: 10, blocked: 2, highComplexity: 12 },
    items,
    insights: [
      'assessment.insights.amendments.coTermination',
      'assessment.insights.amendments.mdqProducts',
      'assessment.insights.amendments.customProration',
    ],
    subTabs: [
      { id: 'amendments-tab', labelKey: 'assessment.subTabs.amendments', itemCount: 14 },
      { id: 'renewals', labelKey: 'assessment.subTabs.renewals', itemCount: 8 },
      {
        id: 'subscription-management',
        labelKey: 'assessment.subTabs.subscriptionManagement',
        itemCount: 12,
      },
    ],
    subscriptionManagement: {
      hasCoTermination: true,
      coTerminationBasis: 'Master contract end date',
      hasMdq: true,
      mdqProductCount: 23,
      prorationMethod: 'Daily proration based on 365-day year',
      hasEvergreen: false,
      hasUplift: true,
      upliftDefaultPercent: 3,
    },
  };
}

function buildApprovalsDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'Discount Override Approval',
      apiName: 'SBQQ__ApprovalChain__c:DISC-OVERRIDE',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Approval Process',
      whyStatus:
        'CPQ Advanced Approvals pattern maps to standard Approval Process but needs manual configuration.',
      aiDescription:
        'Three-tier approval chain for discount overrides: >15% requires manager, >25% requires director, >35% requires VP. Uses Advanced Approvals with approval variables.',
      dependencies: ['Discount Approval Threshold Rule'],
    }),
    makeItem({
      name: 'Non-Standard Terms Approval',
      apiName: 'SBQQ__ApprovalChain__c:NONSTANDARD',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'Approval Process',
      whyStatus: 'Standard approval chain pattern with manual RCA configuration needed.',
      aiDescription:
        'Routes quotes with non-standard payment terms or custom legal clauses to Legal team for review. Single-step approval with email notification.',
    }),
    makeItem({
      name: 'Deal Desk Review',
      apiName: 'SBQQ__ApprovalChain__c:DEAL-DESK',
      complexity: 'high',
      migrationStatus: 'manual',
      rcaTarget: 'Approval Process + Custom Logic',
      whyStatus:
        'Uses Smart Approvals with custom Apex condition evaluator — no direct RCA equivalent.',
      aiDescription:
        'Complex approval routing that evaluates 12 conditions including deal size, customer segment, product mix, and historical win rate. Uses Smart Approvals with a custom Apex condition evaluator class.',
      dependencies: ['DealDeskConditionEvaluator.cls'],
      linesOfCode: 156,
    }),
  ];

  return {
    id: 'approvals',
    labelKey: 'assessment.tabs.approvals',
    complexity: 'moderate',
    stats: { total: 18, auto: 10, guided: 6, manual: 2, blocked: 0, highComplexity: 4 },
    items,
    insights: [
      'assessment.insights.approvals.advancedApprovals',
      'assessment.insights.approvals.smartApprovals',
    ],
    subTabs: [],
  };
}

function buildDocumentsDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'Enterprise Quote Template',
      apiName: 'SBQQ__QuoteTemplate__c:ENT-QUOTE',
      complexity: 'high',
      migrationStatus: 'guided',
      rcaTarget: 'OmniStudio Document Generation',
      whyStatus:
        'Complex template with 8 conditional sections and 42 merge fields — requires manual DocGen template creation.',
      aiDescription:
        'Primary quote template for enterprise deals. 8 sections with conditional visibility based on deal type, product categories, and customer segment. Includes company logo, terms & conditions, and dynamic line item grouping.',
      dependencies: ['CPQ Quote PDF Generator'],
    }),
    makeItem({
      name: 'Partner Quote Template',
      apiName: 'SBQQ__QuoteTemplate__c:PARTNER-QUOTE',
      complexity: 'moderate',
      migrationStatus: 'guided',
      rcaTarget: 'OmniStudio Document Generation',
      whyStatus: 'Standard template with partner-specific branding — needs DocGen rebuild.',
      aiDescription:
        'Simplified quote template for partner channel. Hides internal pricing columns, shows partner discount and MSRP. 4 sections, 28 merge fields.',
    }),
    makeItem({
      name: 'Order Form Template',
      apiName: 'SBQQ__QuoteTemplate__c:ORDER-FORM',
      complexity: 'low',
      migrationStatus: 'guided',
      rcaTarget: 'OmniStudio Document Generation',
      whyStatus: 'Simple template but still requires DocGen rebuild.',
      aiDescription:
        'Post-approval order form with signature blocks and payment terms. Single section, 15 merge fields. No conditional logic.',
    }),
  ];

  return {
    id: 'documents',
    labelKey: 'assessment.tabs.documents',
    complexity: 'low',
    stats: { total: 7, auto: 0, guided: 6, manual: 1, blocked: 0, highComplexity: 2 },
    items,
    insights: [
      'assessment.insights.documents.mergeFields',
      'assessment.insights.documents.conditionalSections',
    ],
    subTabs: [],
  };
}

function buildDataReportingDomain(): DomainData {
  const items: AssessmentItem[] = [
    makeItem({
      name: 'Quote Pipeline Report',
      apiName: 'Report:Quote_Pipeline',
      complexity: 'moderate',
      migrationStatus: 'manual',
      rcaTarget: 'Report (rebuild on RCA objects)',
      whyStatus: 'Report references SBQQ__Quote__c — must be rebuilt on RCA objects.',
      aiDescription:
        'Tabular report showing all open quotes by stage, owner, and amount. Used daily by sales management. Last run: 2 hours ago.',
    }),
    makeItem({
      name: 'Discount Analysis Dashboard',
      apiName: 'Dashboard:Discount_Analysis',
      complexity: 'moderate',
      migrationStatus: 'manual',
      rcaTarget: 'Dashboard (rebuild on RCA objects)',
      whyStatus: 'Dashboard components reference CPQ objects — must be rebuilt.',
      aiDescription:
        'Executive dashboard with 6 components showing discount trends, approval rates, and margin impact. References SBQQ__QuoteLine__c for all metrics.',
    }),
    makeItem({
      name: 'Product Mix Report',
      apiName: 'Report:Product_Mix',
      complexity: 'low',
      migrationStatus: 'manual',
      rcaTarget: 'Report (rebuild on RCA objects)',
      whyStatus: 'Report references CPQ objects — needs rebuild.',
      aiDescription:
        'Summary report of quoted products by category and revenue. Used monthly for product strategy reviews. Last run: 5 days ago.',
    }),
  ];

  return {
    id: 'dataReporting',
    labelKey: 'assessment.tabs.dataReporting',
    complexity: 'moderate',
    stats: { total: 97, auto: 12, guided: 0, manual: 85, blocked: 0, highComplexity: 8 },
    items,
    insights: [
      'assessment.insights.data.historicalQuotes',
      'assessment.insights.data.reportCount',
      'assessment.insights.data.staleReports',
    ],
    subTabs: [
      { id: 'data-volumes', labelKey: 'assessment.subTabs.dataVolumes', itemCount: 0 },
      { id: 'reports-dashboards', labelKey: 'assessment.subTabs.reportsDashboards', itemCount: 85 },
      { id: 'org-health', labelKey: 'assessment.subTabs.orgHealth', itemCount: 0 },
      { id: 'licenses-edition', labelKey: 'assessment.subTabs.licensesEdition', itemCount: 0 },
    ],
    reports: [
      {
        id: 'rpt-1',
        name: 'Quote Pipeline Report',
        type: 'report',
        folder: 'CPQ Reports',
        lastRunDate: daysAgo(0),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c'],
      },
      {
        id: 'rpt-2',
        name: 'Discount Analysis Dashboard',
        type: 'dashboard',
        folder: 'CPQ Dashboards',
        lastRunDate: daysAgo(0),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c', 'SBQQ__QuoteLine__c'],
      },
      {
        id: 'rpt-3',
        name: 'Win/Loss by Product',
        type: 'report',
        folder: 'CPQ Reports',
        lastRunDate: daysAgo(5),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c', 'SBQQ__QuoteLine__c'],
      },
      {
        id: 'rpt-4',
        name: 'Monthly Bookings',
        type: 'report',
        folder: 'CPQ Reports',
        lastRunDate: daysAgo(1),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c'],
      },
      {
        id: 'rpt-5',
        name: 'Stale Draft Quotes',
        type: 'report',
        folder: 'CPQ Reports',
        lastRunDate: daysAgo(30),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c'],
      },
      {
        id: 'rpt-6',
        name: 'Partner Revenue Summary',
        type: 'report',
        folder: 'Partner Reports',
        lastRunDate: daysAgo(7),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c'],
      },
      {
        id: 'rpt-7',
        name: 'Approval Turnaround Time',
        type: 'report',
        folder: 'CPQ Reports',
        lastRunDate: daysAgo(14),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c'],
      },
      {
        id: 'rpt-8',
        name: 'Product Profitability',
        type: 'dashboard',
        folder: 'CPQ Dashboards',
        lastRunDate: daysAgo(3),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__QuoteLine__c'],
      },
      {
        id: 'rpt-9',
        name: 'Subscription Renewals Due',
        type: 'report',
        folder: 'CPQ Reports',
        lastRunDate: daysAgo(1),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Subscription__c', 'SBQQ__Quote__c'],
      },
      {
        id: 'rpt-10',
        name: 'QLE Usage Metrics',
        type: 'report',
        folder: 'CPQ Admin',
        lastRunDate: daysAgo(60),
        referencesCpq: true,
        cpqObjectsReferenced: ['SBQQ__Quote__c'],
      },
      {
        id: 'rpt-11',
        name: 'Account Health Score',
        type: 'dashboard',
        folder: 'Sales Dashboards',
        lastRunDate: daysAgo(0),
        referencesCpq: false,
        cpqObjectsReferenced: [],
      },
      {
        id: 'rpt-12',
        name: 'Lead Conversion Funnel',
        type: 'report',
        folder: 'Marketing Reports',
        lastRunDate: daysAgo(2),
        referencesCpq: false,
        cpqObjectsReferenced: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

function buildRisks(): AssessmentRisk[] {
  return [
    {
      id: 'risk-01',
      description:
        'Calculator plugins (QCP) require full rewrite — 3 plugins totaling ~4,200 LOC with external callouts',
      category: 'technical',
      severity: 'critical',
      likelihood: 5,
      impact: 5,
      affectedItems: ['QCP: onBeforeCalculate'],
      affectedDomains: ['pricing', 'code'],
      mitigation: 'Dedicated Phase 2 sprint for QCP rewrite with integration testing',
      owner: null,
    },
    {
      id: 'risk-02',
      description: '12 integrations reference CPQ objects directly — field remapping required',
      category: 'technical',
      severity: 'high',
      likelihood: 4,
      impact: 4,
      affectedItems: ['ERP Cost Sync (SAP)', 'Billing System Feed', 'DocuSign eSignature'],
      affectedDomains: ['integrations'],
      mitigation: 'Integration audit in Phase 1; create field mapping document per integration',
      owner: null,
    },
    {
      id: 'risk-03',
      description: 'MDQ (Multi-Dimensional Quoting) used for 23 products — partial RCA parity',
      category: 'technical',
      severity: 'critical',
      likelihood: 5,
      impact: 4,
      affectedItems: [],
      affectedDomains: ['amendments', 'products'],
      mitigation:
        'Evaluate workarounds; may require custom development for MDQ-equivalent behavior',
      owner: null,
    },
    {
      id: 'risk-04',
      description:
        'Custom QLE component DealOptimizer has no RCA equivalent — requires OmniStudio rebuild',
      category: 'technical',
      severity: 'high',
      likelihood: 5,
      impact: 3,
      affectedItems: ['DealOptimizer Widget'],
      affectedDomains: ['products', 'code'],
      mitigation: 'Scope OmniStudio FlexCard replacement; may require LWC development',
      owner: null,
    },
    {
      id: 'risk-05',
      description: '85 reports and dashboards reference CPQ objects — all break post-migration',
      category: 'technical',
      severity: 'high',
      likelihood: 5,
      impact: 3,
      affectedItems: [],
      affectedDomains: ['dataReporting'],
      mitigation: 'Prioritize actively-used reports (last run < 30 days); defer stale reports',
      owner: null,
    },
    {
      id: 'risk-06',
      description: 'User adoption risk — RCA has fundamentally different UI than CPQ',
      category: 'organizational',
      severity: 'high',
      likelihood: 4,
      impact: 4,
      affectedItems: [],
      affectedDomains: [],
      mitigation: 'Training plan with parallel run period; create user guides per persona',
      owner: null,
    },
    {
      id: 'risk-07',
      description:
        'Twin fields (18 pairs) must be manually recreated — invisible CPQ configuration',
      category: 'technical',
      severity: 'medium',
      likelihood: 3,
      impact: 4,
      affectedItems: [],
      affectedDomains: ['products'],
      mitigation: 'Automated twin field detection complete; verify each pair post-migration',
      owner: null,
    },
    {
      id: 'risk-08',
      description: 'Salesforce Billing detected — doubles migration complexity if in scope',
      category: 'business',
      severity: 'high',
      likelihood: 3,
      impact: 5,
      affectedItems: [],
      affectedDomains: ['integrations'],
      mitigation: 'Scope decision needed: include Billing in migration or keep as-is?',
      owner: null,
    },
    {
      id: 'risk-09',
      description: 'RCA licenses not detected in org — required for deployment',
      category: 'business',
      severity: 'critical',
      likelihood: 3,
      impact: 5,
      affectedItems: [],
      affectedDomains: [],
      mitigation:
        'Confirm license procurement timeline with customer; blocker for deployment phase',
      owner: null,
    },
    {
      id: 'risk-10',
      description: 'Bundle nesting depth exceeds 3 levels for 4 products — requires restructuring',
      category: 'technical',
      severity: 'medium',
      likelihood: 4,
      impact: 3,
      affectedItems: ['Enterprise Server Bundle'],
      affectedDomains: ['products'],
      mitigation: 'Flatten bundle structure during Product Selling Model design',
      owner: null,
    },
    {
      id: 'risk-11',
      description:
        'Partner channel uses Experience Cloud with CPQ components — separate migration workstream',
      category: 'business',
      severity: 'medium',
      likelihood: 3,
      impact: 3,
      affectedItems: [],
      affectedDomains: ['integrations'],
      mitigation: 'Scope as Phase 3 or separate project',
      owner: null,
    },
    {
      id: 'risk-12',
      description: 'Custom approval logic uses Smart Approvals with Apex condition evaluator',
      category: 'technical',
      severity: 'medium',
      likelihood: 4,
      impact: 3,
      affectedItems: ['Deal Desk Review'],
      affectedDomains: ['approvals', 'code'],
      mitigation: 'Evaluate standard Approval Process capabilities; may need custom Flow',
      owner: null,
    },
    {
      id: 'risk-13',
      description: 'Data migration — 450K historical quotes, 89% older than 2 years',
      category: 'timeline',
      severity: 'medium',
      likelihood: 3,
      impact: 3,
      affectedItems: [],
      affectedDomains: ['dataReporting'],
      mitigation: 'Define retention policy: migrate only last 2 years + active subscriptions',
      owner: null,
    },
    {
      id: 'risk-14',
      description:
        'Co-termination logic uses custom Apex — RCA has native co-term but different approach',
      category: 'technical',
      severity: 'medium',
      likelihood: 3,
      impact: 3,
      affectedItems: ['Co-termination Alignment'],
      affectedDomains: ['amendments'],
      mitigation: 'Evaluate RCA native co-termination; may require custom config',
      owner: null,
    },
    {
      id: 'risk-15',
      description: 'API usage at 42% — bulk data migration may hit governor limits',
      category: 'timeline',
      severity: 'medium',
      likelihood: 2,
      impact: 4,
      affectedItems: [],
      affectedDomains: ['dataReporting'],
      mitigation: 'Schedule bulk operations during off-peak; use Bulk API 2.0',
      owner: null,
    },
    {
      id: 'risk-16',
      description:
        '4 guided selling flows require OmniStudio rebuild — specialized skillset needed',
      category: 'organizational',
      severity: 'medium',
      likelihood: 3,
      impact: 3,
      affectedItems: [],
      affectedDomains: ['products'],
      mitigation: 'Identify OmniStudio-certified resource for team; budget training time',
      owner: null,
    },
    {
      id: 'risk-17',
      description:
        'Custom refund calculation has complex business rules — no declarative RCA equivalent',
      category: 'technical',
      severity: 'high',
      likelihood: 4,
      impact: 3,
      affectedItems: ['Cancellation with Refund Calc'],
      affectedDomains: ['amendments', 'code'],
      mitigation: 'Custom Apex development required; include in code review sprint',
      owner: null,
    },
    {
      id: 'risk-18',
      description:
        'DocuSign and Conga packages reference CPQ objects — package update coordination needed',
      category: 'timeline',
      severity: 'medium',
      likelihood: 3,
      impact: 3,
      affectedItems: [],
      affectedDomains: ['integrations'],
      mitigation: 'Contact vendors for RCA-compatible versions; plan package upgrades',
      owner: null,
    },
    {
      id: 'risk-19',
      description: 'Seasonal promotion engine relies on custom settings — manual migration needed',
      category: 'technical',
      severity: 'low',
      likelihood: 2,
      impact: 2,
      affectedItems: ['Seasonal Promotion Engine'],
      affectedDomains: ['pricing'],
      mitigation: 'Manually recreate custom settings in RCA org',
      owner: null,
    },
    {
      id: 'risk-20',
      description:
        'In-flight quotes during cutover — need transition plan for ~200 active draft quotes',
      category: 'timeline',
      severity: 'high',
      likelihood: 4,
      impact: 4,
      affectedItems: [],
      affectedDomains: ['dataReporting'],
      mitigation: 'Define cutover freeze period; plan for dual-system operation',
      owner: null,
    },
    {
      id: 'risk-21',
      description: 'Test coverage gaps — some CPQ Apex classes below 75% coverage threshold',
      category: 'technical',
      severity: 'low',
      likelihood: 2,
      impact: 2,
      affectedItems: [],
      affectedDomains: ['code'],
      mitigation: 'Rewrite tests alongside code migration; enforce coverage for new code',
      owner: null,
    },
    {
      id: 'risk-22',
      description: 'Quote template conditional sections use complex merge field logic',
      category: 'technical',
      severity: 'medium',
      likelihood: 3,
      impact: 2,
      affectedItems: ['Enterprise Quote Template'],
      affectedDomains: ['documents'],
      mitigation: 'Document all conditional logic; rebuild in OmniStudio DocGen',
      owner: null,
    },
    {
      id: 'risk-23',
      description: 'Stakeholder alignment — different teams own different CPQ areas',
      category: 'organizational',
      severity: 'medium',
      likelihood: 3,
      impact: 3,
      affectedItems: [],
      affectedDomains: [],
      mitigation: 'RACI matrix and weekly stakeholder sync during migration',
      owner: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Key Findings
// ---------------------------------------------------------------------------

function buildKeyFindings(): KeyFinding[] {
  return [
    {
      id: 'kf-1',
      text: 'assessment.findings.bundleCompatible',
      severity: 'success',
      domain: 'products',
    },
    {
      id: 'kf-2',
      text: 'assessment.findings.standardMappings',
      severity: 'success',
      domain: 'pricing',
    },
    { id: 'kf-3', text: 'assessment.findings.soqlLookups', severity: 'warning', domain: 'pricing' },
    {
      id: 'kf-4',
      text: 'assessment.findings.discountFormula',
      severity: 'warning',
      domain: 'pricing',
    },
    { id: 'kf-5', text: 'assessment.findings.qcpCallout', severity: 'error', domain: 'code' },
    { id: 'kf-6', text: 'assessment.findings.inactiveRules', severity: 'success', domain: 'rules' },
    {
      id: 'kf-7',
      text: 'assessment.findings.reportsBreak',
      severity: 'warning',
      domain: 'dataReporting',
    },
    { id: 'kf-8', text: 'assessment.findings.mdqBlocker', severity: 'error', domain: 'amendments' },
  ];
}

// ---------------------------------------------------------------------------
// Runs & Delta
// ---------------------------------------------------------------------------

function buildRuns(): AssessmentRun[] {
  return [
    { id: 'run-3', number: 3, completedAt: daysAgo(0), itemsScanned: 694, duration: 1800 },
    { id: 'run-2', number: 2, completedAt: daysAgo(7), itemsScanned: 725, duration: 1650 },
    { id: 'run-1', number: 1, completedAt: daysAgo(21), itemsScanned: 710, duration: 1920 },
  ];
}

function buildRunDelta(): RunDelta {
  return {
    added: 4,
    removed: 31,
    changed: 8,
    details: [
      { text: 'assessment.delta.rulesRemoved', type: 'removed' },
      { text: 'assessment.delta.newRulesDetected', type: 'added' },
      { text: 'assessment.delta.pricingUnchanged', type: 'unchanged' },
      { text: 'assessment.delta.newApexTrigger', type: 'added' },
      { text: 'assessment.delta.complexityChanged', type: 'changed' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Org Health
// ---------------------------------------------------------------------------

function buildOrgHealth(): OrgHealth {
  return {
    edition: 'Enterprise',
    apiUsagePercent: 42,
    storageUsagePercent: 61,
    apexGovernorPercent: 28,
    cpqLicenseCount: 58,
    rcaLicenseCount: 0,
    hasSalesforceBilling: true,
    billingObjectCount: 12,
  };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

function buildCompleteness(): CompletenessItem[] {
  return [
    { id: 'comp-1', labelKey: 'assessment.completeness.orgScanned', completed: true },
    { id: 'comp-2', labelKey: 'assessment.completeness.domainsInventoried', completed: true },
    { id: 'comp-3', labelKey: 'assessment.completeness.gapAnalysis', completed: true },
    { id: 'comp-4', labelKey: 'assessment.completeness.triageComplete', completed: false },
    { id: 'comp-5', labelKey: 'assessment.completeness.businessContext', completed: false },
    { id: 'comp-6', labelKey: 'assessment.completeness.effortEstimation', completed: false },
    { id: 'comp-7', labelKey: 'assessment.completeness.riskMitigations', completed: false },
    { id: 'comp-8', labelKey: 'assessment.completeness.consultantSections', completed: false },
    { id: 'comp-9', labelKey: 'assessment.completeness.pdfGenerated', completed: false },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns rich assessment data for the Q1 Migration project.
 * Returns null for all other projects (they don't have assessment data
 * or use the simple AssessmentData from workspace-mock-data).
 */
/**
 * Real assessment data extracted from a live Salesforce org.
 * Generated by: npx tsx apps/worker/scripts/export-assessment.ts
 * Then: npx tsx apps/worker/scripts/transform-to-ui.ts
 */
import realAssessmentData from './assessment-real-data.json';

export function getMockAssessmentData(projectId: string): AssessmentData | null {
  // Phase 2 Migration project → real Salesforce extraction data
  if (projectId === MOCK_IDS.PROJECT_PHASE2) {
    return realAssessmentData as unknown as AssessmentData;
  }

  // Q1 Migration project → original mock data
  if (projectId !== MOCK_IDS.PROJECT_Q1_MIGRATION) {
    return null;
  }

  // Reset counter for deterministic IDs
  idCounter = 0;

  const domains: DomainData[] = [
    buildProductsDomain(),
    buildPricingDomain(),
    buildRulesDomain(),
    buildCodeDomain(),
    buildIntegrationsDomain(),
    buildAmendmentsDomain(),
    buildApprovalsDomain(),
    buildDocumentsDomain(),
    buildDataReportingDomain(),
  ];

  const totalAuto = domains.reduce((sum, d) => sum + d.stats.auto, 0);
  const totalGuided = domains.reduce((sum, d) => sum + d.stats.guided, 0);
  const totalManual = domains.reduce((sum, d) => sum + d.stats.manual, 0);
  const totalBlocked = domains.reduce((sum, d) => sum + d.stats.blocked, 0);

  return {
    projectId,
    domains,
    risks: buildRisks(),
    keyFindings: buildKeyFindings(),
    runs: buildRuns(),
    currentRunIndex: 0,
    runDelta: buildRunDelta(),
    orgHealth: buildOrgHealth(),
    completeness: buildCompleteness(),
    totalItems: totalAuto + totalGuided + totalManual + totalBlocked,
    totalAuto,
    totalGuided,
    totalManual,
    totalBlocked,
  };
}

/**
 * Returns the list of domain IDs in display order.
 */
export const DOMAIN_TAB_ORDER: DomainId[] = [
  'products',
  'pricing',
  'rules',
  'code',
  'integrations',
  'amendments',
  'approvals',
  'documents',
  'dataReporting',
];
