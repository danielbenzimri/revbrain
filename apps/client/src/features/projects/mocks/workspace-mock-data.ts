/**
 * Workspace Mock Data
 *
 * Comprehensive mock data for the project workspace UI.
 * Provides realistic data for each project at different migration stages.
 */
import { MOCK_IDS } from '@/lib/mock-ids';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthStatus = 'done' | 'warning' | 'pending' | 'in_progress' | 'error';
export type IssueSeverity = 'blocker' | 'warning' | 'info';
export type RunStatus = 'completed' | 'running' | 'failed' | 'queued';
export type ConnectionHealth = 'healthy' | 'degraded' | 'disconnected';

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface HealthStripItem {
  id: string;
  label: string;
  translationKey: string;
  status: HealthStatus;
  statusText: string;
  statusTextKey: string;
  route: string;
}

export interface ConnectionCardData {
  id: string;
  orgName: string;
  orgType: 'Production' | 'Sandbox' | 'Developer' | 'Scratch';
  instanceUrl: string;
  cpqVersion: string | null;
  apiVersion: string;
  health: ConnectionHealth;
  lastSync: string | null;
  objectCount: number | null;
  recordCount: number | null;
  apiCallsUsed: number;
  apiCallsLimit: number;
  apiResetTime: string;
}

export interface WhatsNextData {
  title: string;
  titleKey: string;
  description: string;
  descriptionKey: string;
  ctaLabel: string;
  ctaLabelKey: string;
  ctaRoute: string;
  secondaryLabel: string | null;
  secondaryLabelKey: string | null;
  secondaryRoute: string | null;
  variant: 'default' | 'success' | 'error';
}

export interface IssueItem {
  id: string;
  title: string;
  severity: IssueSeverity;
  object: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'extraction' | 'assessment' | 'connection' | 'deployment' | 'user' | 'settings';
  message: string;
  messageKey: string;
  user: string;
  timestamp: string;
}

export interface RunItem {
  id: string;
  number: number;
  type: 'extraction' | 'assessment' | 'deployment' | 'validation';
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  objectsProcessed: number | null;
  recordsProcessed: number | null;
}

export interface AssessmentData {
  totalRules: number;
  autoMigrate: number;
  guidedMigrate: number;
  manualMigrate: number;
  blocked: number;
  completedAt: string;
  score: number;
}

export interface CpqExplorerData {
  totalObjects: number;
  totalRecords: number;
  extractedAt: string;
  topObjects: Array<{
    name: string;
    recordCount: number;
    hasCustomFields: boolean;
  }>;
}

export interface WorkspaceData {
  project: ProjectInfo;
  healthStrip: HealthStripItem[];
  sourceConnection: ConnectionCardData | null;
  targetConnection: ConnectionCardData | null;
  whatsNext: WhatsNextData;
  topIssues: IssueItem[];
  recentActivity: ActivityItem[];
  recentRuns: RunItem[];
  assessment: AssessmentData | null;
  cpqExplorerData: CpqExplorerData | null;
}

// ---------------------------------------------------------------------------
// Helper: relative time strings
// ---------------------------------------------------------------------------

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

function minutesFromNow(m: number): string {
  return new Date(Date.now() + m * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Q1 Migration — mid-journey (source connected, data extracted, assessment done)
// ---------------------------------------------------------------------------

function getQ1MigrationData(projectId: string): WorkspaceData {
  return {
    project: {
      id: projectId,
      name: 'Q1 Migration',
      description: 'Migrate Salesforce CPQ to Revenue Cloud Advanced for Q1 launch',
      status: 'active',
      createdAt: daysAgo(30),
      updatedAt: hoursAgo(1),
    },
    healthStrip: [
      {
        id: 'source',
        label: 'Source',
        translationKey: 'workspace.health.source',
        status: 'done',
        statusText: 'Connected',
        statusTextKey: 'workspace.health.connected',
        route: '',
      },
      {
        id: 'data',
        label: 'Data',
        translationKey: 'workspace.health.data',
        status: 'done',
        statusText: '12,847 records',
        statusTextKey: 'workspace.health.recordCount',
        route: 'cpq-explorer',
      },
      {
        id: 'assessment',
        label: 'Assessment',
        translationKey: 'workspace.health.assessment',
        status: 'done',
        statusText: '24 rules analyzed',
        statusTextKey: 'workspace.health.rulesAnalyzed',
        route: 'assessment',
      },
      {
        id: 'target',
        label: 'Target',
        translationKey: 'workspace.health.target',
        status: 'pending',
        statusText: 'Not connected',
        statusTextKey: 'workspace.health.notConnected',
        route: '',
      },
      {
        id: 'deploy',
        label: 'Deploy',
        translationKey: 'workspace.health.deploy',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'deployment',
      },
      {
        id: 'validate',
        label: 'Validate',
        translationKey: 'workspace.health.validate',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'deployment',
      },
    ],
    sourceConnection: {
      id: MOCK_IDS.SF_CONNECTION_ACME_SOURCE,
      orgName: 'acme.my.salesforce.com',
      orgType: 'Production',
      instanceUrl: 'https://acme.my.salesforce.com',
      cpqVersion: 'CPQ 242.1',
      apiVersion: 'v66.0',
      health: 'healthy',
      lastSync: hoursAgo(2),
      objectCount: 42,
      recordCount: 12847,
      apiCallsUsed: 8420,
      apiCallsLimit: 100000,
      apiResetTime: minutesFromNow(47),
    },
    targetConnection: null,
    whatsNext: {
      title: 'Connect your target org',
      titleKey: 'workspace.whatsNext.connectTarget.title',
      description:
        'Your assessment is complete. Connect your Revenue Cloud Advanced org to start deploying migrated configurations.',
      descriptionKey: 'workspace.whatsNext.connectTarget.description',
      ctaLabel: 'Connect Target Org',
      ctaLabelKey: 'workspace.whatsNext.connectTarget.cta',
      ctaRoute: '',
      secondaryLabel: 'Review assessment results',
      secondaryLabelKey: 'workspace.whatsNext.connectTarget.secondary',
      secondaryRoute: 'assessment',
      variant: 'default',
    },
    topIssues: [
      {
        id: 'issue-1',
        title: 'Custom price rule references deprecated field CPQ_Custom__c',
        severity: 'blocker',
        object: 'SBQQ__PriceRule__c',
        createdAt: hoursAgo(3),
      },
      {
        id: 'issue-2',
        title: 'Quote template uses unsupported merge field syntax',
        severity: 'warning',
        object: 'SBQQ__QuoteTemplate__c',
        createdAt: hoursAgo(5),
      },
      {
        id: 'issue-3',
        title: 'Product bundle structure exceeds RCA nesting limit',
        severity: 'info',
        object: 'SBQQ__ProductOption__c',
        createdAt: daysAgo(1),
      },
    ],
    recentActivity: [
      {
        id: 'act-1',
        type: 'assessment',
        message: 'Assessment run #10 completed',
        messageKey: 'workspace.activity.assessmentCompleted',
        user: 'Sarah Chen',
        timestamp: hoursAgo(1),
      },
      {
        id: 'act-2',
        type: 'extraction',
        message: 'Data extraction run #9 completed',
        messageKey: 'workspace.activity.extractionCompleted',
        user: 'System',
        timestamp: hoursAgo(2),
      },
      {
        id: 'act-3',
        type: 'user',
        message: 'Mike Torres joined the project',
        messageKey: 'workspace.activity.userJoined',
        user: 'Mike Torres',
        timestamp: hoursAgo(6),
      },
      {
        id: 'act-4',
        type: 'settings',
        message: 'Project description updated',
        messageKey: 'workspace.activity.settingsUpdated',
        user: 'Sarah Chen',
        timestamp: daysAgo(1),
      },
      {
        id: 'act-5',
        type: 'connection',
        message: 'Source org connected successfully',
        messageKey: 'workspace.activity.sourceConnected',
        user: 'Sarah Chen',
        timestamp: daysAgo(2),
      },
    ],
    recentRuns: [
      {
        id: 'run-10',
        number: 10,
        type: 'assessment',
        status: 'completed',
        startedAt: hoursAgo(1.5),
        completedAt: hoursAgo(1),
        duration: 1800,
        objectsProcessed: 42,
        recordsProcessed: 12847,
      },
      {
        id: 'run-9',
        number: 9,
        type: 'extraction',
        status: 'completed',
        startedAt: hoursAgo(3),
        completedAt: hoursAgo(2),
        duration: 3600,
        objectsProcessed: 42,
        recordsProcessed: 12847,
      },
    ],
    assessment: {
      totalRules: 24,
      autoMigrate: 12,
      guidedMigrate: 8,
      manualMigrate: 3,
      blocked: 1,
      completedAt: hoursAgo(1),
      score: 83,
    },
    cpqExplorerData: {
      totalObjects: 42,
      totalRecords: 12847,
      extractedAt: hoursAgo(2),
      topObjects: [
        { name: 'SBQQ__Quote__c', recordCount: 3240, hasCustomFields: true },
        { name: 'SBQQ__QuoteLine__c', recordCount: 4891, hasCustomFields: true },
        { name: 'SBQQ__Product2__c', recordCount: 856, hasCustomFields: false },
        { name: 'SBQQ__PriceRule__c', recordCount: 127, hasCustomFields: true },
        { name: 'SBQQ__ProductOption__c', recordCount: 2433, hasCustomFields: false },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Legacy Cleanup — early stage (source connected, no extraction yet)
// ---------------------------------------------------------------------------

function getLegacyCleanupData(projectId: string): WorkspaceData {
  return {
    project: {
      id: projectId,
      name: 'Legacy Cleanup',
      description: 'Clean up and optimize legacy CPQ configuration before migration',
      status: 'active',
      createdAt: daysAgo(14),
      updatedAt: daysAgo(1),
    },
    healthStrip: [
      {
        id: 'source',
        label: 'Source',
        translationKey: 'workspace.health.source',
        status: 'done',
        statusText: 'Connected',
        statusTextKey: 'workspace.health.connected',
        route: '',
      },
      {
        id: 'data',
        label: 'Data',
        translationKey: 'workspace.health.data',
        status: 'pending',
        statusText: 'Not extracted',
        statusTextKey: 'workspace.health.notExtracted',
        route: 'cpq-explorer',
      },
      {
        id: 'assessment',
        label: 'Assessment',
        translationKey: 'workspace.health.assessment',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'assessment',
      },
      {
        id: 'target',
        label: 'Target',
        translationKey: 'workspace.health.target',
        status: 'pending',
        statusText: 'Not connected',
        statusTextKey: 'workspace.health.notConnected',
        route: '',
      },
      {
        id: 'deploy',
        label: 'Deploy',
        translationKey: 'workspace.health.deploy',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'deployment',
      },
      {
        id: 'validate',
        label: 'Validate',
        translationKey: 'workspace.health.validate',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'deployment',
      },
    ],
    sourceConnection: {
      id: 'sf-conn-beta',
      orgName: 'beta-corp.my.salesforce.com',
      orgType: 'Sandbox',
      instanceUrl: 'https://beta-corp.my.salesforce.com',
      cpqVersion: 'CPQ 238.0',
      apiVersion: 'v64.0',
      health: 'healthy',
      lastSync: daysAgo(1),
      objectCount: null,
      recordCount: null,
      apiCallsUsed: 1200,
      apiCallsLimit: 50000,
      apiResetTime: minutesFromNow(120),
    },
    targetConnection: null,
    whatsNext: {
      title: 'Extract your CPQ data',
      titleKey: 'workspace.whatsNext.extractData.title',
      description:
        'Your source org is connected. Run a data extraction to analyze your CPQ configuration and records.',
      descriptionKey: 'workspace.whatsNext.extractData.description',
      ctaLabel: 'Start Extraction',
      ctaLabelKey: 'workspace.whatsNext.extractData.cta',
      ctaRoute: 'cpq-explorer',
      secondaryLabel: 'View connection details',
      secondaryLabelKey: 'workspace.whatsNext.extractData.secondary',
      secondaryRoute: '',
      variant: 'default',
    },
    topIssues: [],
    recentActivity: [
      {
        id: 'act-1',
        type: 'connection',
        message: 'Source org connected successfully',
        messageKey: 'workspace.activity.sourceConnected',
        user: 'Alex Kim',
        timestamp: daysAgo(1),
      },
      {
        id: 'act-2',
        type: 'settings',
        message: 'Project created',
        messageKey: 'workspace.activity.projectCreated',
        user: 'Alex Kim',
        timestamp: daysAgo(14),
      },
    ],
    recentRuns: [],
    assessment: null,
    cpqExplorerData: null,
  };
}

// ---------------------------------------------------------------------------
// RCA Pilot — fully completed journey
// ---------------------------------------------------------------------------

function getRcaPilotData(projectId: string): WorkspaceData {
  return {
    project: {
      id: projectId,
      name: 'RCA Pilot',
      description:
        'Pilot project for Revenue Cloud Advanced migration — full end-to-end validation',
      status: 'completed',
      createdAt: daysAgo(90),
      updatedAt: daysAgo(3),
    },
    healthStrip: [
      {
        id: 'source',
        label: 'Source',
        translationKey: 'workspace.health.source',
        status: 'done',
        statusText: 'Connected',
        statusTextKey: 'workspace.health.connected',
        route: '',
      },
      {
        id: 'data',
        label: 'Data',
        translationKey: 'workspace.health.data',
        status: 'done',
        statusText: '8,291 records',
        statusTextKey: 'workspace.health.recordCount',
        route: 'cpq-explorer',
      },
      {
        id: 'assessment',
        label: 'Assessment',
        translationKey: 'workspace.health.assessment',
        status: 'done',
        statusText: '18 rules analyzed',
        statusTextKey: 'workspace.health.rulesAnalyzed',
        route: 'assessment',
      },
      {
        id: 'target',
        label: 'Target',
        translationKey: 'workspace.health.target',
        status: 'done',
        statusText: 'Connected',
        statusTextKey: 'workspace.health.connected',
        route: '',
      },
      {
        id: 'deploy',
        label: 'Deploy',
        translationKey: 'workspace.health.deploy',
        status: 'done',
        statusText: 'Deployed',
        statusTextKey: 'workspace.health.deployed',
        route: 'deployment',
      },
      {
        id: 'validate',
        label: 'Validate',
        translationKey: 'workspace.health.validate',
        status: 'done',
        statusText: 'Passed',
        statusTextKey: 'workspace.health.passed',
        route: 'deployment',
      },
    ],
    sourceConnection: {
      id: 'sf-conn-pilot-source',
      orgName: 'pilot.my.salesforce.com',
      orgType: 'Sandbox',
      instanceUrl: 'https://pilot.my.salesforce.com',
      cpqVersion: 'CPQ 240.2',
      apiVersion: 'v65.0',
      health: 'healthy',
      lastSync: daysAgo(3),
      objectCount: 31,
      recordCount: 8291,
      apiCallsUsed: 2100,
      apiCallsLimit: 50000,
      apiResetTime: minutesFromNow(90),
    },
    targetConnection: {
      id: 'sf-conn-pilot-target',
      orgName: 'pilot-rca.my.salesforce.com',
      orgType: 'Sandbox',
      instanceUrl: 'https://pilot-rca.my.salesforce.com',
      cpqVersion: null,
      apiVersion: 'v66.0',
      health: 'healthy',
      lastSync: daysAgo(3),
      objectCount: 28,
      recordCount: 8140,
      apiCallsUsed: 3500,
      apiCallsLimit: 50000,
      apiResetTime: minutesFromNow(60),
    },
    whatsNext: {
      title: 'Migration complete',
      titleKey: 'workspace.whatsNext.complete.title',
      description:
        'All migration steps are done. Your CPQ configuration has been successfully migrated to Revenue Cloud Advanced.',
      descriptionKey: 'workspace.whatsNext.complete.description',
      ctaLabel: 'View Final Report',
      ctaLabelKey: 'workspace.whatsNext.complete.cta',
      ctaRoute: 'artifacts',
      secondaryLabel: null,
      secondaryLabelKey: null,
      secondaryRoute: null,
      variant: 'success',
    },
    topIssues: [],
    recentActivity: [
      {
        id: 'act-1',
        type: 'deployment',
        message: 'Validation passed — all checks green',
        messageKey: 'workspace.activity.validationPassed',
        user: 'System',
        timestamp: daysAgo(3),
      },
      {
        id: 'act-2',
        type: 'deployment',
        message: 'Deployment run #7 completed successfully',
        messageKey: 'workspace.activity.deploymentCompleted',
        user: 'Sarah Chen',
        timestamp: daysAgo(3),
      },
      {
        id: 'act-3',
        type: 'assessment',
        message: 'Assessment finalized — 95% auto-migratable',
        messageKey: 'workspace.activity.assessmentFinalized',
        user: 'System',
        timestamp: daysAgo(10),
      },
      {
        id: 'act-4',
        type: 'extraction',
        message: 'Data extraction run #4 completed',
        messageKey: 'workspace.activity.extractionCompleted',
        user: 'System',
        timestamp: daysAgo(15),
      },
      {
        id: 'act-5',
        type: 'connection',
        message: 'Target org connected successfully',
        messageKey: 'workspace.activity.targetConnected',
        user: 'Alex Kim',
        timestamp: daysAgo(30),
      },
    ],
    recentRuns: [
      {
        id: 'run-8',
        number: 8,
        type: 'validation',
        status: 'completed',
        startedAt: daysAgo(3),
        completedAt: daysAgo(3),
        duration: 900,
        objectsProcessed: 28,
        recordsProcessed: 8140,
      },
      {
        id: 'run-7',
        number: 7,
        type: 'deployment',
        status: 'completed',
        startedAt: daysAgo(3),
        completedAt: daysAgo(3),
        duration: 5400,
        objectsProcessed: 31,
        recordsProcessed: 8291,
      },
    ],
    assessment: {
      totalRules: 18,
      autoMigrate: 15,
      guidedMigrate: 2,
      manualMigrate: 1,
      blocked: 0,
      completedAt: daysAgo(10),
      score: 95,
    },
    cpqExplorerData: {
      totalObjects: 31,
      totalRecords: 8291,
      extractedAt: daysAgo(15),
      topObjects: [
        { name: 'SBQQ__Quote__c', recordCount: 2100, hasCustomFields: true },
        { name: 'SBQQ__QuoteLine__c', recordCount: 3400, hasCustomFields: false },
        { name: 'SBQQ__Product2__c', recordCount: 620, hasCustomFields: false },
        { name: 'SBQQ__PriceRule__c', recordCount: 89, hasCustomFields: true },
        { name: 'SBQQ__Subscription__c', recordCount: 1200, hasCustomFields: false },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2 Migration — brand new project (no connections)
// ---------------------------------------------------------------------------

function getPhase2Data(projectId: string): WorkspaceData {
  return {
    project: {
      id: projectId,
      name: 'Phase 2 Migration',
      description: 'Second phase of enterprise CPQ to RCA migration',
      status: 'active',
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    },
    healthStrip: [
      {
        id: 'source',
        label: 'Source',
        translationKey: 'workspace.health.source',
        status: 'pending',
        statusText: 'Not connected',
        statusTextKey: 'workspace.health.notConnected',
        route: '',
      },
      {
        id: 'data',
        label: 'Data',
        translationKey: 'workspace.health.data',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'cpq-explorer',
      },
      {
        id: 'assessment',
        label: 'Assessment',
        translationKey: 'workspace.health.assessment',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'assessment',
      },
      {
        id: 'target',
        label: 'Target',
        translationKey: 'workspace.health.target',
        status: 'pending',
        statusText: 'Not connected',
        statusTextKey: 'workspace.health.notConnected',
        route: '',
      },
      {
        id: 'deploy',
        label: 'Deploy',
        translationKey: 'workspace.health.deploy',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'deployment',
      },
      {
        id: 'validate',
        label: 'Validate',
        translationKey: 'workspace.health.validate',
        status: 'pending',
        statusText: 'Waiting',
        statusTextKey: 'workspace.health.waiting',
        route: 'deployment',
      },
    ],
    sourceConnection: null,
    targetConnection: null,
    whatsNext: {
      title: 'Connect your source Salesforce org',
      titleKey: 'workspace.whatsNext.connectSource.title',
      description:
        "Start by connecting the Salesforce org that contains your CPQ configuration. We'll analyze it to plan your migration.",
      descriptionKey: 'workspace.whatsNext.connectSource.description',
      ctaLabel: 'Connect Source Org',
      ctaLabelKey: 'workspace.whatsNext.connectSource.cta',
      ctaRoute: '',
      secondaryLabel: 'Learn about the migration process',
      secondaryLabelKey: 'workspace.whatsNext.connectSource.secondary',
      secondaryRoute: 'artifacts',
      variant: 'default',
    },
    topIssues: [],
    recentActivity: [
      {
        id: 'act-1',
        type: 'settings',
        message: 'Project created',
        messageKey: 'workspace.activity.projectCreated',
        user: 'Sarah Chen',
        timestamp: daysAgo(2),
      },
    ],
    recentRuns: [],
    assessment: null,
    cpqExplorerData: null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns full workspace data for a given project ID.
 * Falls back to Phase 2 (empty state) for unknown project IDs.
 */
export function getMockProjectWorkspaceData(projectId: string): WorkspaceData {
  switch (projectId) {
    case MOCK_IDS.PROJECT_Q1_MIGRATION:
      return getQ1MigrationData(projectId);
    case MOCK_IDS.PROJECT_LEGACY_CLEANUP:
      return getLegacyCleanupData(projectId);
    case MOCK_IDS.PROJECT_RCA_PILOT:
      return getRcaPilotData(projectId);
    case MOCK_IDS.PROJECT_PHASE2:
      return getPhase2Data(projectId);
    default:
      return getPhase2Data(projectId);
  }
}

/**
 * Returns a list of recent projects for the project switcher.
 */
export function getMockRecentProjects(): Array<{ id: string; name: string; status: string }> {
  return [
    { id: MOCK_IDS.PROJECT_Q1_MIGRATION, name: 'Q1 Migration', status: 'active' },
    { id: MOCK_IDS.PROJECT_LEGACY_CLEANUP, name: 'Legacy Cleanup', status: 'active' },
    { id: MOCK_IDS.PROJECT_RCA_PILOT, name: 'RCA Pilot', status: 'completed' },
    { id: MOCK_IDS.PROJECT_PHASE2, name: 'Phase 2 Migration', status: 'active' },
  ];
}
