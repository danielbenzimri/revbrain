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

  it('issues a single chunk when the input fits within chunkSize', async () => {
    const ids = ['a01', 'a02', 'a03'];
    const stub = vi.fn().mockResolvedValueOnce({
      records: [
        { Id: 'a01', Metadata: { errorConditionFormula: 'IF(...)' } },
        { Id: 'a02', Metadata: { errorConditionFormula: 'NOT(...)' } },
        { Id: 'a03', Metadata: { errorConditionFormula: 'AND(...)' } },
      ],
    });
    const result = await fetchToolingMetadata('ValidationRule', ids, stub);
    expect(result.chunksIssued).toBe(1);
    expect(result.byId.size).toBe(3);
    expect(result.byId.get('a01')).toBeDefined();
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('issues multiple chunks when the input exceeds chunkSize', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `a${String(i).padStart(3, '0')}`);
    const stub = vi.fn().mockImplementation(async (soql: string) => ({
      // Echo back the IDs in the IN clause as a record per id.
      records: [...soql.matchAll(/'(a\d{3})'/g)].map((m) => ({
        Id: m[1]!,
        Metadata: { value: m[1] },
      })),
    }));
    const result = await fetchToolingMetadata('ValidationRule', ids, stub);
    // 25 ids / chunkSize 10 = 3 chunks (10 + 10 + 5)
    expect(result.chunksIssued).toBe(3);
    expect(result.byId.size).toBe(25);
    expect(stub).toHaveBeenCalledTimes(3);
  });

  it('continues on partial chunk failure and tracks failed IDs', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `a${i}`);
    let callCount = 0;
    const stub = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('chunk 2 failed');
      return { records: [] };
    });
    const result = await fetchToolingMetadata('Flow', ids, stub);
    expect(result.chunksIssued).toBe(2);
    // Only chunk 2 (the second slice of 10 ids) failed.
    expect(result.failedIds.size).toBe(10);
  });

  it('re-throws when every chunk fails (total failure surfaces a real error)', async () => {
    const ids = ['a', 'b', 'c'];
    const stub = vi.fn().mockRejectedValue(new Error('total wipeout'));
    await expect(fetchToolingMetadata('Flow', ids, stub)).rejects.toThrow('total wipeout');
  });

  it('dedupes the input list (same id twice → one query per chunk only)', async () => {
    const ids = ['a01', 'a02', 'a01', 'a02']; // duplicates
    const stub = vi.fn().mockResolvedValueOnce({ records: [{ Id: 'a01' }, { Id: 'a02' }] });
    const result = await fetchToolingMetadata('ValidationRule', ids, stub);
    expect(result.chunksIssued).toBe(1);
    expect(result.byId.size).toBe(2);
    // Verify the SOQL only contains each id once.
    const calledSoql = stub.mock.calls[0]![0] as string;
    const aMatches = calledSoql.match(/'a01'/g) ?? [];
    expect(aMatches.length).toBe(1);
  });

  it('sorts the input list deterministically (cross-run reproducibility)', async () => {
    const stub = vi.fn().mockResolvedValue({ records: [] });
    await fetchToolingMetadata('Flow', ['c', 'a', 'b'], stub);
    const soql = stub.mock.calls[0]![0] as string;
    // Sorted order: 'a','b','c'.
    expect(soql.indexOf("'a'")).toBeLessThan(soql.indexOf("'b'"));
    expect(soql.indexOf("'b'")).toBeLessThan(soql.indexOf("'c'"));
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

  it('TOOLING_METADATA_CHUNK_SIZE constant is exported and reasonable', () => {
    expect(TOOLING_METADATA_CHUNK_SIZE).toBeGreaterThanOrEqual(5);
    expect(TOOLING_METADATA_CHUNK_SIZE).toBeLessThanOrEqual(25);
  });
});
