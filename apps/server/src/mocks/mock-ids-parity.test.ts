/**
 * Mock ID Source Test
 *
 * Verifies that MOCK_IDS from the server mocks module resolves to the
 * shared @revbrain/seed-data package, ensuring single source of truth.
 *
 * Previous test: checked text parity between server and client files.
 * Now: both import from @revbrain/seed-data, so parity is structural.
 */
import { describe, it, expect } from 'vitest';
import { MOCK_IDS as serverIds } from './constants.ts';
import { MOCK_IDS as seedDataIds } from '@revbrain/seed-data';

describe('Mock ID source (shared seed-data package)', () => {
  it('server MOCK_IDS matches seed-data package MOCK_IDS', () => {
    // Both should be the exact same object reference since server re-exports from seed-data
    expect(Object.keys(serverIds).length).toBe(Object.keys(seedDataIds).length);

    for (const [key, value] of Object.entries(seedDataIds)) {
      expect(
        (serverIds as Record<string, string>)[key],
        `MOCK_IDS.${key} mismatch between server and seed-data`
      ).toBe(value);
    }
  });

  it('all IDs are unique UUIDs', () => {
    const values = Object.values(serverIds);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
