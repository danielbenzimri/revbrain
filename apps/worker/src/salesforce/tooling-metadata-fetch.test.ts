/**
 * Unit tests for the chunked Tooling-API Metadata fetch helper
 * (EXT-1.4 + EXT-1.6).
 */

import { describe, expect, it, vi } from 'vitest';
import { fetchToolingMetadata, TOOLING_METADATA_CHUNK_SIZE } from './tooling-metadata-fetch.ts';

describe('fetchToolingMetadata', () => {
  it('returns an empty result for an empty input list', async () => {
    const stub = vi.fn();
    const result = await fetchToolingMetadata('ValidationRule', [], stub);
    expect(result.byId.size).toBe(0);
    expect(result.failedIds.size).toBe(0);
    expect(result.chunksIssued).toBe(0);
    expect(stub).not.toHaveBeenCalled();
  });

  it('issues one chunk per ID when called with a small list (3 IDs = 3 chunks)', async () => {
    const ids = ['a01', 'a02', 'a03'];
    const stub = vi.fn().mockImplementation(async (soql: string) => {
      const match = soql.match(/'(a\d{2})'/);
      if (!match) return { records: [] };
      return {
        records: [{ Id: match[1], Metadata: { errorConditionFormula: `IF(${match[1]})` } }],
      };
    });
    const result = await fetchToolingMetadata('ValidationRule', ids, stub);
    expect(result.chunksIssued).toBe(3);
    expect(result.byId.size).toBe(3);
    expect(result.byId.get('a01')).toBeDefined();
    expect(stub).toHaveBeenCalledTimes(3);
  });

  it('issues one query per ID (chunk size 1 = SF Metadata-column hard limit)', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `a${String(i).padStart(3, '0')}`);
    const stub = vi.fn().mockImplementation(async (soql: string) => ({
      // Echo back the one ID in the IN clause as a single record.
      records: [...soql.matchAll(/'(a\d{3})'/g)].map((m) => ({
        Id: m[1]!,
        Metadata: { value: m[1] },
      })),
    }));
    const result = await fetchToolingMetadata('ValidationRule', ids, stub);
    // Chunk size is 1 (SF Tooling API hard limit on Metadata
    // column queries), so 25 IDs = 25 chunks.
    expect(result.chunksIssued).toBe(25);
    expect(result.byId.size).toBe(25);
    expect(stub).toHaveBeenCalledTimes(25);
  });

  it('continues on per-ID failure and tracks failed IDs', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `a${i}`);
    let callCount = 0;
    const stub = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 7) throw new Error('call 7 failed');
      return { records: [] };
    });
    const result = await fetchToolingMetadata('Flow', ids, stub);
    expect(result.chunksIssued).toBe(20); // one call per id
    // Only the 7th call (7th id, sorted) failed → failedIds size 1.
    expect(result.failedIds.size).toBe(1);
  });

  it('re-throws when every chunk fails (total failure surfaces a real error)', async () => {
    const ids = ['a', 'b', 'c'];
    const stub = vi.fn().mockRejectedValue(new Error('total wipeout'));
    await expect(fetchToolingMetadata('Flow', ids, stub)).rejects.toThrow('total wipeout');
  });

  it('dedupes the input list (same id twice → only one query for that id)', async () => {
    const ids = ['a01', 'a02', 'a01', 'a02']; // duplicates
    const stub = vi.fn().mockImplementation(async (soql: string) => {
      const match = soql.match(/'(a\d{2})'/);
      return match ? { records: [{ Id: match[1] }] } : { records: [] };
    });
    const result = await fetchToolingMetadata('ValidationRule', ids, stub);
    // 2 distinct ids → 2 chunks (chunk size 1).
    expect(result.chunksIssued).toBe(2);
    expect(result.byId.size).toBe(2);
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('sorts the input list deterministically (cross-run reproducibility)', async () => {
    const calls: string[] = [];
    const stub = vi.fn().mockImplementation(async (soql: string) => {
      calls.push(soql);
      return { records: [] };
    });
    await fetchToolingMetadata('Flow', ['c', 'a', 'b'], stub);
    // Chunk size 1 + sorted input → call 0 is 'a', call 1 is 'b', call 2 is 'c'.
    expect(calls[0]).toContain("'a'");
    expect(calls[1]).toContain("'b'");
    expect(calls[2]).toContain("'c'");
  });

  it('passes extraFields through to the SOQL projection', async () => {
    const stub = vi.fn().mockResolvedValue({ records: [] });
    await fetchToolingMetadata('ValidationRule', ['a01'], stub, {
      extraFields: ['ValidationName', 'Active'],
    });
    const soql = stub.mock.calls[0]![0] as string;
    expect(soql).toContain('SELECT Id, Metadata, ValidationName, Active');
  });

  it('respects custom chunkSize', async () => {
    const ids = ['a', 'b', 'c', 'd'];
    const stub = vi.fn().mockResolvedValue({ records: [] });
    await fetchToolingMetadata('Flow', ids, stub, { chunkSize: 2 });
    expect(stub).toHaveBeenCalledTimes(2); // 4 / 2
  });

  it('TOOLING_METADATA_CHUNK_SIZE constant is exactly 1 (SF Tooling API hard limit)', () => {
    // Per the staging-validated wave-3 fix: Salesforce rejects
    // any Metadata-column query that returns > 1 row with
    // MALFORMED_QUERY. Changing this constant to anything > 1
    // is a regression — do not "optimize" it without a real SF
    // behavior change. Verified against real staging org on
    // 2026-04-11.
    expect(TOOLING_METADATA_CHUNK_SIZE).toBe(1);
  });
});
