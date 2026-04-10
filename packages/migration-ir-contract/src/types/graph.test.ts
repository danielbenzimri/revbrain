import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IR_SCHEMA_VERSION } from './schema-version.ts';
import type { GraphMetadataIR, IRGraph, OrgFingerprintIR, ReferenceIndex } from './graph.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PH0.10 — IRGraph envelope + GraphMetadataIR + schema version', () => {
  it('IR_SCHEMA_VERSION is importable and equals "1.0.0"', () => {
    expect(IR_SCHEMA_VERSION).toBe('1.0.0');
    expect(typeof IR_SCHEMA_VERSION).toBe('string');
  });

  it('a minimal IRGraph type-checks', () => {
    const org: OrgFingerprintIR = {
      id: 'org-fp',
      contentHash: 'org-hash',
      nodeType: 'OrgFingerprint',
      displayName: 'Example Org',
      warnings: [],
      evidence: {
        sourceFindingKeys: ['f-org'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['discovery'],
      },
    };
    const refIndex: ReferenceIndex = {
      byObject: {},
      byField: {},
      byPath: {},
      byNodeId: {},
      dynamicRefs: [],
      unresolvedRefs: [],
    };
    const metadata: GraphMetadataIR = {
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
    };
    const graph: IRGraph = {
      irSchemaVersion: IR_SCHEMA_VERSION,
      bb3Version: '0.0.0-ph0.10',
      orgFingerprint: org,
      extractedAt: '2026-04-10T00:00:00Z',
      nodes: [],
      edges: [],
      referenceIndex: refIndex,
      metadata,
      quarantine: [],
    };
    expect(graph.irSchemaVersion).toBe('1.0.0');
    expect(graph.nodes).toEqual([]);
  });

  it('graph.ts contains no forbidden timing fields (lint test)', () => {
    const source = readFileSync(join(__dirname, 'graph.ts'), 'utf8');
    // These substrings MUST NOT appear as field names on IRGraph / GraphMetadataIR.
    // `extractedAt` is the allowed single ISO-8601 field; allow it.
    // `capturedAt` is on SchemaCatalog (not on the graph envelope), not in this file.
    const lines = source.split('\n');
    const forbidden: Array<{ pattern: RegExp; name: string }> = [
      { pattern: /\bbb3DurationMs\b/, name: 'bb3DurationMs' },
      { pattern: /\bdurationMs\b/, name: 'durationMs' },
      { pattern: /\bstageDurations\b/, name: 'stageDurations' },
      { pattern: /\bapexParseStats\b/, name: 'apexParseStats' },
      { pattern: /\bgeneratedAt\b/, name: 'generatedAt' },
      { pattern: /\bbuildTimestamp\b/, name: 'buildTimestamp' },
    ];
    for (const { pattern, name } of forbidden) {
      const offending = lines.filter((l, i) => {
        if (!pattern.test(l)) return false;
        // Allow mentions in JSDoc comments (e.g. "FORBIDDEN: bb3DurationMs").
        // A JSDoc comment line has ` *` or `//` prefix.
        const trimmed = l.trimStart();
        return !trimmed.startsWith('*') && !trimmed.startsWith('//');
        void i;
      });
      expect(
        offending,
        `forbidden field ${name} found in graph.ts: ${offending.join('\n')}`
      ).toEqual([]);
    }
  });
});
