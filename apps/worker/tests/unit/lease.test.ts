import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock postgres.js tagged template function.
 * postgres.js returns an array of row objects from template literals.
 */
function createMockSql(returnValues: unknown[][] = []) {
  let callIndex = 0;
  const calls: Array<{ strings: string[]; values: unknown[] }> = [];

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const idx = callIndex++;
    calls.push({ strings: [...strings], values });
    return Promise.resolve(returnValues[idx] ?? []);
  };

  return { sql: sql as unknown, calls, getCallIndex: () => callIndex };
}

describe('LeaseManager CAS semantics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use CAS condition on claim (status=dispatched AND lease expired)', async () => {
    const { LeaseManager } = await import('../../src/lease.ts');
    const { sql, calls } = createMockSql([
      [{ id: 'run-1' }], // First call: claim succeeds (1 row returned)
    ]);

    const lease = new LeaseManager(sql as never, 'run-1');
    const claimed = await lease.claim();

    expect(claimed).toBe(true);
    expect(calls).toHaveLength(1);

    // Verify CAS conditions in the query
    const queryStr = calls[0].strings.join('');
    expect(queryStr).toContain('dispatched');
    expect(queryStr).toContain('worker_id IS NULL OR lease_expires_at < NOW()');
  });

  it('should return false when claim fails (another worker holds lease)', async () => {
    const { LeaseManager } = await import('../../src/lease.ts');
    const { sql } = createMockSql([
      [], // First call: empty result = claim failed
    ]);

    const lease = new LeaseManager(sql as never, 'run-1');
    const claimed = await lease.claim();
    expect(claimed).toBe(false);
  });

  it('should use worker_id CAS on renew', async () => {
    const { LeaseManager } = await import('../../src/lease.ts');
    const { sql, calls } = createMockSql([
      [{ worker_id: 'test' }], // Renew succeeds
    ]);

    const lease = new LeaseManager(sql as never, 'run-1');
    const renewed = await lease.renew();

    expect(renewed).toBe(true);
    expect(calls).toHaveLength(1);

    const queryStr = calls[0].strings.join('');
    expect(queryStr).toContain('worker_id');
  });

  it('should return false when renew detects lease loss (0 rows)', async () => {
    const { LeaseManager } = await import('../../src/lease.ts');
    const { sql } = createMockSql([
      [], // 0 rows = lease lost
    ]);

    const lease = new LeaseManager(sql as never, 'run-1');
    const renewed = await lease.renew();
    expect(renewed).toBe(false);
  });

  it('should retry 3 times on transient DB error during renew', async () => {
    const { LeaseManager } = await import('../../src/lease.ts');

    let callCount = 0;
    const sql = () => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error('connection reset'));
      }
      return Promise.resolve([{ worker_id: 'test' }]);
    };

    const lease = new LeaseManager(sql as never, 'run-1');

    vi.useFakeTimers();
    const renewPromise = lease.renew();
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    vi.useRealTimers();

    const result = await renewPromise;
    expect(result).toBe(true);
    expect(callCount).toBe(3);
  });

  it('should generate unique worker IDs', async () => {
    const { LeaseManager } = await import('../../src/lease.ts');
    const sql = () => Promise.resolve([]);

    const lease1 = new LeaseManager(sql as never, 'run-1');
    const lease2 = new LeaseManager(sql as never, 'run-2');

    expect(lease1.getWorkerId()).not.toBe(lease2.getWorkerId());
    expect(lease1.getWorkerId()).toMatch(/^worker-/);
  });
});
