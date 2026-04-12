/**
 * SEG-5.1 — Edge classification coverage property test.
 *
 * Asserts that STRONG ∪ ORDERING ∪ HAZARD covers every value
 * in the IREdgeType union. If a new edge type is added to the
 * contract without updating the segmenter's classification,
 * this test fails.
 */
import { describe, expect, it } from 'vitest';
import {
  STRONG_EDGE_TYPES,
  ORDERING_EDGE_TYPES,
  HAZARD_EDGE_TYPES,
  ALL_CLASSIFIED_EDGE_TYPES,
} from '../src/edge-classification.ts';
import { PROJECTED_EDGE_TYPES, SYNTHETIC_EDGE_TYPES } from '@revbrain/migration-ir-contract';

describe('SEG-5.1 — classification coverage', () => {
  it('all IREdgeType values (projected + synthetic) are classified', () => {
    const allIREdgeTypes = new Set([...PROJECTED_EDGE_TYPES, ...SYNTHETIC_EDGE_TYPES]);
    for (const edgeType of allIREdgeTypes) {
      expect(
        ALL_CLASSIFIED_EDGE_TYPES.has(edgeType),
        `IREdgeType '${edgeType}' is NOT classified in STRONG ∪ ORDERING ∪ HAZARD. ` +
          `Add it to one of the three sets in edge-classification.ts.`
      ).toBe(true);
    }
  });

  it('classified count matches IREdgeType count', () => {
    const allIREdgeTypes = new Set([...PROJECTED_EDGE_TYPES, ...SYNTHETIC_EDGE_TYPES]);
    expect(ALL_CLASSIFIED_EDGE_TYPES.size).toBe(allIREdgeTypes.size);
  });

  it('no classified type is missing from the contract', () => {
    const allIREdgeTypes = new Set([...PROJECTED_EDGE_TYPES, ...SYNTHETIC_EDGE_TYPES]);
    for (const classified of ALL_CLASSIFIED_EDGE_TYPES) {
      expect(
        allIREdgeTypes.has(classified),
        `Classified edge type '${classified}' does not exist in IREdgeType contract. ` +
          `Remove it from edge-classification.ts or add it to the contract.`
      ).toBe(true);
    }
  });

  it('no overlap between the three sets', () => {
    for (const t of STRONG_EDGE_TYPES) {
      expect(ORDERING_EDGE_TYPES.has(t), `'${t}' in both STRONG and ORDERING`).toBe(false);
      expect(HAZARD_EDGE_TYPES.has(t), `'${t}' in both STRONG and HAZARD`).toBe(false);
    }
    for (const t of ORDERING_EDGE_TYPES) {
      expect(HAZARD_EDGE_TYPES.has(t), `'${t}' in both ORDERING and HAZARD`).toBe(false);
    }
  });
});
