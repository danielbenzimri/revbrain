import { describe, it, expect, vi } from 'vitest';

// Test the write module's batch splitting and retry logic
// Full integration tests require a running DB

describe('writeCollectorData', () => {
  it('should call SQL with correct batch structure', async () => {
    const { writeCollectorData } = await import('../../src/db/writes.ts');

    const operations: string[] = [];

    // Mock postgres.js SQL template + begin/transaction
    const mockTx = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');
      operations.push(query.slice(0, 50));
      // For SELECT (existing findings), return empty
      if (query.includes('SELECT id FROM assessment_findings')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
    // Mock the batch insert helper
    mockTx.unsafe = (val: string) => val;
    (mockTx as any).__proto__ = Function.prototype;

    const mockSql = Object.assign(() => Promise.resolve([]), {
      begin: async (fn: (tx: unknown) => Promise<void>) => {
        // The tx object needs to support both template calls and the batch helper
        const tx = Object.assign(mockTx, {
          // postgres.js batch insert: tx`INSERT INTO table ${tx(values)}`
          // We mock tx as callable for both tagged templates and as a function for values
        });
        await fn(tx);
      },
    });

    await writeCollectorData({
      sql: mockSql as never,
      runId: 'run-1',
      organizationId: 'org-1',
      collectorName: 'catalog',
      findings: [
        {
          domain: 'catalog' as const,
          collectorName: 'catalog',
          artifactType: 'Product2',
          artifactName: 'Test Product',
          findingKey: 'catalog:Product2:001:active',
          sourceType: 'object' as const,
          evidenceRefs: [],
          schemaVersion: '1.0',
        },
      ],
    });

    // Verify the transaction was called
    expect(operations.length).toBeGreaterThan(0);
    // First operation should be SELECT for existing findings
    expect(operations[0]).toContain('SELECT');
  });

  it('should retry on transient error and succeed', async () => {
    const { writeCollectorData } = await import('../../src/db/writes.ts');

    let callCount = 0;
    const mockSql = {
      begin: async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('connection reset');
        }
      },
    };

    // Real timers — 1s + 2s backoff = 3s total wait
    await writeCollectorData({
      sql: mockSql as never,
      runId: 'run-1',
      organizationId: 'org-1',
      collectorName: 'catalog',
      findings: [],
    });
    expect(callCount).toBe(3);
  }, 10_000);

  it('should throw after 3 failed attempts', async () => {
    const { writeCollectorData } = await import('../../src/db/writes.ts');

    const mockSql = {
      begin: async () => {
        throw new Error('persistent failure');
      },
    };

    await expect(
      writeCollectorData({
        sql: mockSql as never,
        runId: 'run-1',
        organizationId: 'org-1',
        collectorName: 'catalog',
        findings: [],
      })
    ).rejects.toThrow('Failed to write collector data after 3 attempts');
  }, 10_000);
});
