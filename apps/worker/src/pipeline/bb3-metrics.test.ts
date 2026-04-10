import { describe, expect, it } from 'vitest';
import { emitBB3Metrics, summarizeNormalizeResult, type Logger } from './bb3-metrics.ts';
import type { NormalizeResult } from '@revbrain/bb3-normalizer';

function mockResult(over: Partial<NormalizeResult> = {}): NormalizeResult {
  const base: NormalizeResult = {
    graph: {
      irSchemaVersion: '1.0.0',
      bb3Version: '0.0.0-test',
      orgFingerprint: {
        id: 'org-1',
        contentHash: 'h',
        nodeType: 'OrgFingerprint',
        displayName: 'Org',
        warnings: [],
        evidence: {
          sourceFindingKeys: [],
          classificationReasons: [],
          cpqFieldsRead: [],
          cpqFieldsWritten: [],
          sourceSalesforceRecordIds: [],
          sourceCollectors: [],
        },
      },
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [],
      edges: [],
      referenceIndex: {
        byObject: {},
        byField: {},
        byPath: {},
        byNodeId: {},
        dynamicRefs: [],
        unresolvedRefs: [],
      },
      metadata: {
        collectorCoverage: {},
        collectorWarnings: {},
        degradedInputs: [],
        quarantineCount: 0,
        totalFindingsConsumed: 0,
        totalIRNodesEmitted: 0,
        cycleCount: 0,
        unknownArtifactCount: 0,
        unresolvedRefCount: 0,
        schemaCatalogHash: null,
      },
      quarantine: [],
    },
    runtimeStats: {
      durationMs: 42,
      stageDurations: [
        { stage: 'input-gate', durationMs: 1 },
        { stage: 'normalize', durationMs: 10 },
        { stage: 'validate', durationMs: 2 },
      ],
      totalFindingsIn: 100,
      totalNodesOut: 90,
      quarantineCount: 1,
      bb3Version: '0.0.0-test',
    },
    diagnostics: [
      { severity: 'error', stage: 'validate', code: 'BB3_V1A', message: 'fail' },
      { severity: 'warning', stage: 'input-gate', code: 'BB3_Q001', message: 'warn' },
    ],
    quarantine: [
      {
        findingKey: 'q1',
        artifactType: 'Unknown',
        reason: 'unknown-artifact',
        detail: '',
        raw: {},
      },
    ],
    serialized: '{}',
  };
  return { ...base, ...over };
}

describe('PH8.3 — BB-3 metrics sink', () => {
  it('flattens runtimeStats into an event payload', () => {
    const event = summarizeNormalizeResult(mockResult());
    expect(event.event).toBe('bb3_normalize_complete');
    expect(event.durationMs).toBe(42);
    expect(event.totalFindingsIn).toBe(100);
    expect(event.stageDurations['normalize']).toBe(10);
  });

  it('counts diagnostics by severity', () => {
    const event = summarizeNormalizeResult(mockResult());
    expect(event.diagnosticCounts.error).toBe(1);
    expect(event.diagnosticCounts.warning).toBe(1);
    expect(event.diagnosticCounts.info).toBe(0);
  });

  it('counts quarantine by reason', () => {
    const event = summarizeNormalizeResult(mockResult());
    expect(event.quarantineByReason['unknown-artifact']).toBe(1);
  });

  it('emitBB3Metrics calls the logger with the event payload', () => {
    const calls: Array<{ payload: Record<string, unknown>; msg: string }> = [];
    const logger: Logger = {
      info: (payload, msg) => calls.push({ payload, msg }),
    };
    emitBB3Metrics(mockResult(), logger);
    expect(calls.length).toBe(1);
    expect(calls[0]?.msg).toBe('bb3_normalize_complete');
    expect((calls[0]?.payload as { durationMs: number }).durationMs).toBe(42);
  });

  it('aggregates stage durations deterministically when stages repeat', () => {
    const result = mockResult();
    result.runtimeStats.stageDurations.push({ stage: 'normalize', durationMs: 5 });
    const event = summarizeNormalizeResult(result);
    expect(event.stageDurations['normalize']).toBe(15);
  });
});
