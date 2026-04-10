import { describe, expect, it } from 'vitest';
import { IR_NODE_TYPES, type IRNodeType, type IRNodeBase } from './nodes.ts';
import type {
  ApexClassAutomationIR,
  ApexTriggerAutomationIR,
  AutomationIR,
  FlowAutomationIR,
  OutboundMessageAutomationIR,
  WorkflowRuleAutomationIR,
} from './automation.ts';

describe('PH0.3 — IRNodeBase + IRNodeType + AutomationIR', () => {
  describe('IRNodeType union', () => {
    it('includes ConnectedApp and CPQSettingsBundle (v1.1 additions)', () => {
      expect(IR_NODE_TYPES).toContain('ConnectedApp');
      expect(IR_NODE_TYPES).toContain('CPQSettingsBundle');
    });

    it('excludes ProcessBuilder, SubscriptionLifecycle, CustomField (v1.1 removals)', () => {
      expect(IR_NODE_TYPES as readonly string[]).not.toContain('ProcessBuilder');
      expect(IR_NODE_TYPES as readonly string[]).not.toContain('SubscriptionLifecycle');
      expect(IR_NODE_TYPES as readonly string[]).not.toContain('CustomField');
    });

    it('exhaustive switch over IRNodeType type-checks without default', () => {
      // Type-level exhaustiveness check — if a new IRNodeType member is
      // added without a case clause, TypeScript will reject the assignment
      // of `never` to `string` below.
      const describeType = (t: IRNodeType): string => {
        switch (t) {
          case 'PricingRule':
          case 'PriceCondition':
          case 'PriceAction':
          case 'DiscountSchedule':
          case 'DiscountTier':
          case 'BlockPrice':
          case 'ContractedPrice':
          case 'SummaryVariable':
          case 'LookupQuery':
          case 'BundleStructure':
          case 'BundleOption':
          case 'BundleFeature':
          case 'ConfigConstraint':
          case 'Product':
          case 'ConfigurationAttribute':
          case 'Automation':
          case 'ValidationRule':
          case 'FormulaField':
          case 'CustomMetadataType':
          case 'RecordType':
          case 'DocumentTemplate':
          case 'QuoteTermBlock':
          case 'CustomAction':
          case 'ApprovalProcess':
          case 'ApprovalChainRule':
          case 'NamedCredential':
          case 'ExternalDataSource':
          case 'ConnectedApp':
          case 'PlatformEvent':
          case 'CustomComputation':
          case 'LocalizationBundle':
          case 'UsageStatistic':
          case 'CPQSettingsBundle':
          case 'OrgFingerprint':
          case 'CyclicDependency':
          case 'UnknownArtifact':
            return t;
        }
        // If this is reached, `t` is typed as `never` — meaning all cases
        // were covered. Assigning `never` to `string` is a compile error
        // that proves exhaustiveness. The runtime throw is unreachable.
        const _exhaustive: never = t;
        throw new Error(`unreachable: ${String(_exhaustive)}`);
      };
      // Runtime check: every IR_NODE_TYPES entry flows through the switch.
      for (const t of IR_NODE_TYPES) {
        expect(describeType(t)).toBe(t);
      }
    });
  });

  describe('IRNodeBase', () => {
    it('requires both id and contentHash (identity split, §5.2)', () => {
      const base: IRNodeBase = {
        id: 'node-abc',
        contentHash: 'hash-xyz',
        nodeType: 'PricingRule',
        displayName: 'Test Rule',
        evidence: {
          sourceFindingKeys: ['f-1'],
          classificationReasons: [],
          cpqFieldsRead: [],
          cpqFieldsWritten: [],
          sourceSalesforceRecordIds: [],
          sourceCollectors: ['pricing'],
        },
        warnings: [],
      };
      expect(base.id).toBe('node-abc');
      expect(base.contentHash).toBe('hash-xyz');
    });
  });

  describe('AutomationIR discriminated union', () => {
    const makeBase = (): Omit<
      ApexClassAutomationIR,
      | 'sourceType'
      | 'lineCount'
      | 'calloutCount'
      | 'hasTriggerControl'
      | 'hasDynamicFieldRef'
      | 'isTestClass'
      | 'parseStatus'
      | 'parseErrors'
    > => ({
      id: 'auto-1',
      contentHash: 'h-1',
      nodeType: 'Automation',
      displayName: 'Auto',
      warnings: [],
      sbqqFieldRefs: [],
      writtenFields: [],
      relatedRules: [],
      evidence: {
        sourceFindingKeys: ['f-1'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['automation'],
      },
    });

    it('narrows ApexClass and exposes lineCount', () => {
      const auto: AutomationIR = {
        ...makeBase(),
        sourceType: 'ApexClass',
        lineCount: 42,
        calloutCount: 1,
        hasTriggerControl: true,
        hasDynamicFieldRef: false,
        isTestClass: false,
        parseStatus: 'parsed',
        parseErrors: [],
      };
      if (auto.sourceType === 'ApexClass') {
        const apex: ApexClassAutomationIR = auto;
        expect(apex.lineCount).toBe(42);
        expect(apex.calloutCount).toBe(1);
      } else {
        throw new Error('branch');
      }
    });

    it('narrows ApexTrigger and exposes triggerObject + triggerEvents', () => {
      const auto: AutomationIR = {
        ...makeBase(),
        sourceType: 'ApexTrigger',
        triggerObject: 'SBQQ__Quote__c',
        triggerEvents: ['insert', 'update'],
        lineCount: 20,
        hasTriggerControl: false,
        hasDynamicFieldRef: false,
        parseStatus: 'parsed',
        parseErrors: [],
      };
      if (auto.sourceType === 'ApexTrigger') {
        const trg: ApexTriggerAutomationIR = auto;
        expect(trg.triggerObject).toBe('SBQQ__Quote__c');
        expect(trg.triggerEvents).toEqual(['insert', 'update']);
      } else {
        throw new Error('branch');
      }
    });

    it('narrows Flow and exposes flowType + activeVersionNumber', () => {
      const auto: AutomationIR = {
        ...makeBase(),
        sourceType: 'Flow',
        flowType: 'record-triggered',
        activeVersionNumber: 3,
        elementCounts: { decision: 2, assignment: 1 },
        triggerObject: 'SBQQ__Quote__c',
        triggerEvents: ['create', 'update'],
        parseStatus: 'metadata-only',
      };
      if (auto.sourceType === 'Flow') {
        const flow: FlowAutomationIR = auto;
        expect(flow.flowType).toBe('record-triggered');
        expect(flow.activeVersionNumber).toBe(3);
      } else {
        throw new Error('branch');
      }
    });

    it('narrows WorkflowRule', () => {
      const auto: AutomationIR = {
        ...makeBase(),
        sourceType: 'WorkflowRule',
        targetObject: 'SBQQ__Quote__c',
        evaluationCriteria: 'on-create-or-update',
        criteriaFormula: 'Amount > 10000',
        fieldUpdates: [],
        isActive: true,
      };
      if (auto.sourceType === 'WorkflowRule') {
        const wr: WorkflowRuleAutomationIR = auto;
        expect(wr.evaluationCriteria).toBe('on-create-or-update');
      } else {
        throw new Error('branch');
      }
    });

    it('narrows OutboundMessage', () => {
      const auto: AutomationIR = {
        ...makeBase(),
        sourceType: 'OutboundMessage',
        endpointUrl: 'https://example.invalid/hook',
        targetObject: 'SBQQ__Quote__c',
        fieldsSent: [],
        isActive: true,
      };
      if (auto.sourceType === 'OutboundMessage') {
        const om: OutboundMessageAutomationIR = auto;
        expect(om.endpointUrl).toBe('https://example.invalid/hook');
      } else {
        throw new Error('branch');
      }
    });

    it('Flow variant does NOT expose calloutCount (v1.2 ontology cleanup)', () => {
      // Type-level proof that Apex-specific fields are absent on Flow.
      // This is intentionally a compile-time check — if v1.2 regresses
      // and adds `calloutCount` to FlowAutomationIR, the @ts-expect-error
      // will start failing.
      const flow: FlowAutomationIR = {
        ...makeBase(),
        sourceType: 'Flow',
        flowType: 'autolaunched',
        activeVersionNumber: 1,
        elementCounts: {},
        triggerObject: null,
        triggerEvents: null,
        parseStatus: 'metadata-only',
      };
      // @ts-expect-error — calloutCount does not exist on FlowAutomationIR.
      const _never: number = flow.calloutCount;
      void _never;
      expect(flow.sourceType).toBe('Flow');
    });
  });
});
