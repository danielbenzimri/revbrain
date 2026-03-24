/**
 * Unit tests for assessment mock data
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  getMockAssessmentData,
  DOMAIN_TAB_ORDER,
} from './assessment-mock-data';

// Use the same constant as the source
const Q1_PROJECT_ID = '00000000-0000-4000-a000-000000000401';

describe('getMockAssessmentData', () => {
  it('returns data for Q1 Migration project', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID);
    expect(data).not.toBeNull();
    expect(data!.projectId).toBe(Q1_PROJECT_ID);
  });

  it('returns null for non-Q1 projects', () => {
    expect(getMockAssessmentData('unknown-id')).toBeNull();
    expect(getMockAssessmentData('00000000-0000-4000-a000-000000000402')).toBeNull();
    expect(getMockAssessmentData('00000000-0000-4000-a000-000000000403')).toBeNull();
  });

  it('has 9 domains', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data.domains).toHaveLength(9);
  });

  it('domain IDs match DOMAIN_TAB_ORDER', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    const domainIds = data.domains.map((d) => d.id);
    expect(domainIds).toEqual(DOMAIN_TAB_ORDER);
  });

  it('total items equals sum of domain stats', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data.totalItems).toBe(data.totalAuto + data.totalGuided + data.totalManual + data.totalBlocked);
    // totalItems should equal sum of auto+guided+manual+blocked across domains
    const autoSum = data.domains.reduce((s, d) => s + d.stats.auto, 0);
    const guidedSum = data.domains.reduce((s, d) => s + d.stats.guided, 0);
    const manualSum = data.domains.reduce((s, d) => s + d.stats.manual, 0);
    const blockedSum = data.domains.reduce((s, d) => s + d.stats.blocked, 0);
    expect(data.totalAuto).toBe(autoSum);
    expect(data.totalGuided).toBe(guidedSum);
    expect(data.totalManual).toBe(manualSum);
    expect(data.totalBlocked).toBe(blockedSum);
    // Each domain's total should equal its auto+guided+manual+blocked
    for (const domain of data.domains) {
      const domainSum = domain.stats.auto + domain.stats.guided + domain.stats.manual + domain.stats.blocked;
      expect(domainSum).toBe(domain.stats.total);
    }
  });

  it('every item has required fields', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    for (const domain of data.domains) {
      for (const item of domain.items) {
        expect(item.id).toBeTruthy();
        expect(item.name).toBeTruthy();
        expect(item.apiName).toBeTruthy();
        expect(['low', 'moderate', 'high']).toContain(item.complexity);
        expect(['auto', 'guided', 'manual', 'blocked']).toContain(item.migrationStatus);
        expect(['untriaged', 'in_scope', 'excluded', 'needs_discussion']).toContain(item.triageState);
        expect(item.whyStatus).toBeTruthy();
        expect(item.aiDescription).toBeTruthy();
        expect(typeof item.isActive).toBe('boolean');
      }
    }
  });

  it('has no duplicate item IDs across all domains', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    const allIds = data.domains.flatMap((d) => d.items.map((i) => i.id));
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('risk register has 23 entries', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data.risks).toHaveLength(23);
  });

  it('every risk has valid category and severity', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    for (const risk of data.risks) {
      expect(risk.id).toBeTruthy();
      expect(risk.description).toBeTruthy();
      expect(['technical', 'business', 'timeline', 'organizational']).toContain(risk.category);
      expect(['critical', 'high', 'medium', 'low']).toContain(risk.severity);
      expect(risk.likelihood).toBeGreaterThanOrEqual(1);
      expect(risk.likelihood).toBeLessThanOrEqual(5);
      expect(risk.impact).toBeGreaterThanOrEqual(1);
      expect(risk.impact).toBeLessThanOrEqual(5);
      expect(risk.mitigation).toBeTruthy();
    }
  });

  it('run history is chronologically ordered (newest first)', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data.runs.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < data.runs.length; i++) {
      const prev = new Date(data.runs[i - 1].completedAt).getTime();
      const curr = new Date(data.runs[i].completedAt).getTime();
      expect(prev).toBeGreaterThan(curr);
    }
  });

  it('run numbers are descending', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    for (let i = 1; i < data.runs.length; i++) {
      expect(data.runs[i - 1].number).toBeGreaterThan(data.runs[i].number);
    }
  });

  it('org health has valid percentages', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data.orgHealth.apiUsagePercent).toBeGreaterThanOrEqual(0);
    expect(data.orgHealth.apiUsagePercent).toBeLessThanOrEqual(100);
    expect(data.orgHealth.storageUsagePercent).toBeGreaterThanOrEqual(0);
    expect(data.orgHealth.storageUsagePercent).toBeLessThanOrEqual(100);
    expect(data.orgHealth.edition).toBeTruthy();
  });

  it('completeness has both completed and pending items', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data.completeness.length).toBeGreaterThan(0);
    expect(data.completeness.some((c) => c.completed)).toBe(true);
    expect(data.completeness.some((c) => !c.completed)).toBe(true);
  });

  it('key findings have valid severities', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data.keyFindings.length).toBeGreaterThan(0);
    for (const finding of data.keyFindings) {
      expect(['success', 'warning', 'error']).toContain(finding.severity);
    }
  });

  it('domains with sub-tabs have matching sub-tab data', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    const products = data.domains.find((d) => d.id === 'products')!;
    expect(products.subTabs.length).toBe(4);
    expect(products.guidedSellingFlows).toBeDefined();
    expect(products.guidedSellingFlows!.length).toBeGreaterThan(0);
    expect(products.qleCustomizations).toBeDefined();
    expect(products.twinFields).toBeDefined();

    const pricing = data.domains.find((d) => d.id === 'pricing')!;
    expect(pricing.subTabs.length).toBe(3);
    expect(pricing.contractedPricing).toBeDefined();
    expect(pricing.currencies).toBeDefined();

    const code = data.domains.find((d) => d.id === 'code')!;
    expect(code.subTabs.length).toBe(2);
    expect(code.permissionSets).toBeDefined();

    const integrations = data.domains.find((d) => d.id === 'integrations')!;
    expect(integrations.subTabs.length).toBe(4);
    expect(integrations.packageDependencies).toBeDefined();

    const amendments = data.domains.find((d) => d.id === 'amendments')!;
    expect(amendments.subTabs.length).toBe(3);
    expect(amendments.subscriptionManagement).toBeDefined();
  });

  it('domains without sub-tabs have empty sub-tab arrays', () => {
    const data = getMockAssessmentData(Q1_PROJECT_ID)!;
    const rules = data.domains.find((d) => d.id === 'rules')!;
    expect(rules.subTabs).toHaveLength(0);

    const approvals = data.domains.find((d) => d.id === 'approvals')!;
    expect(approvals.subTabs).toHaveLength(0);

    const documents = data.domains.find((d) => d.id === 'documents')!;
    expect(documents.subTabs).toHaveLength(0);
  });

  it('returns deterministic data on multiple calls', () => {
    const data1 = getMockAssessmentData(Q1_PROJECT_ID)!;
    const data2 = getMockAssessmentData(Q1_PROJECT_ID)!;
    expect(data1.totalItems).toBe(data2.totalItems);
    expect(data1.risks.length).toBe(data2.risks.length);
    expect(data1.domains.length).toBe(data2.domains.length);
    // IDs should be deterministic
    expect(data1.domains[0].items[0].id).toBe(data2.domains[0].items[0].id);
  });
});
