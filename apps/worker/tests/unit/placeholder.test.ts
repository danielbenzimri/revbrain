import { describe, it, expect } from 'vitest';

describe('worker scaffold', () => {
  it('should pass a basic assertion', () => {
    expect(true).toBe(true);
  });

  it('should be able to import from @revbrain/contract', async () => {
    const contract = await import('@revbrain/contract');
    expect(contract.AppError).toBeDefined();
  });

  it('should be able to import from @revbrain/database', async () => {
    const database = await import('@revbrain/database');
    // Schema exports should be available
    expect(database).toBeDefined();
  });
});
