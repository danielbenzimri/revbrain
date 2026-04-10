import { describe, expect, it } from 'vitest';
import type { DirectFieldRef, FieldRefIR, PathFieldRef } from './field-ref.ts';
import type { EvidenceBlock } from './evidence.ts';

describe('PH0.6 — FieldRefIR + EvidenceBlock', () => {
  describe('FieldRefIR', () => {
    it('narrows a direct field ref on `kind`', () => {
      const ref: FieldRefIR = {
        kind: 'field',
        object: 'SBQQ__Quote__c',
        field: 'SBQQ__NetAmount__c',
        isCustom: true,
        isCpqManaged: true,
        isResolved: true,
      };
      if (ref.kind === 'field') {
        const direct: DirectFieldRef = ref;
        expect(direct.object).toBe('SBQQ__Quote__c');
        expect(direct.field).toBe('SBQQ__NetAmount__c');
      } else {
        throw new Error('branch should not execute');
      }
    });

    it('narrows a path field ref on `kind`', () => {
      const ref: FieldRefIR = {
        kind: 'path',
        rootObject: 'SBQQ__Quote__c',
        path: ['Account__r', 'Owner'],
        terminalField: 'Profile.Name',
        isCustom: false,
        isCpqManaged: true,
        isResolved: true,
      };
      if (ref.kind === 'path') {
        const path: PathFieldRef = ref;
        expect(path.rootObject).toBe('SBQQ__Quote__c');
        expect(path.path).toEqual(['Account__r', 'Owner']);
        expect(path.terminalField).toBe('Profile.Name');
      } else {
        throw new Error('branch should not execute');
      }
    });

    it('supports dynamic unresolved refs with a hint', () => {
      const ref: FieldRefIR = {
        kind: 'field',
        object: 'SBQQ__Quote__c',
        field: '<dynamic>',
        isCustom: false,
        isCpqManaged: true,
        isResolved: false,
        unresolvedReason: 'dynamic',
        hint: 'fieldVar',
      };
      expect(ref.isResolved).toBe(false);
      expect(ref.unresolvedReason).toBe('dynamic');
      expect(ref.hint).toBe('fieldVar');
    });

    it('supports no-catalog unresolved path refs', () => {
      const ref: FieldRefIR = {
        kind: 'path',
        rootObject: '<unknown>',
        path: ['Parent__r'],
        terminalField: 'Name',
        isCustom: false,
        isCpqManaged: false,
        isResolved: false,
        unresolvedReason: 'no-catalog',
      };
      expect(ref.isResolved).toBe(false);
      expect(ref.unresolvedReason).toBe('no-catalog');
    });

    it('path ref with rootObject and path serializes deterministically', () => {
      const a: PathFieldRef = {
        kind: 'path',
        rootObject: 'SBQQ__Quote__c',
        path: ['Account__r', 'Owner'],
        terminalField: 'Profile.Name',
        isCustom: false,
        isCpqManaged: true,
        isResolved: true,
      };
      const b: PathFieldRef = JSON.parse(JSON.stringify(a));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  describe('EvidenceBlock', () => {
    it('type-checks with a minimal evidence block', () => {
      const ev: EvidenceBlock = {
        sourceFindingKeys: ['finding-1'],
        classificationReasons: [
          {
            decision: 'evaluationPhase',
            chosenValue: 'on-calc',
            reason: 'SBQQ__EvaluationEvent__c = "On Calculate" -> on-calc',
            confidence: 'high',
          },
        ],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      };
      expect(ev.sourceFindingKeys.length).toBeGreaterThanOrEqual(1);
      expect(ev.classificationReasons[0]?.confidence).toBe('high');
    });
  });
});
