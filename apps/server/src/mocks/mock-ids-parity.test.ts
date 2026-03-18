/**
 * Mock ID Parity Test
 *
 * Verifies that client-side mock IDs match server-side mock IDs.
 * Reads the client file as text to avoid cross-package import issues.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MOCK_IDS } from './constants.ts';

describe('Mock ID parity (server ↔ client)', () => {
  it('client mock-ids.ts contains all server MOCK_IDS values', () => {
    const clientFilePath = resolve(__dirname, '../../../../apps/client/src/lib/mock-ids.ts');
    const clientContent = readFileSync(clientFilePath, 'utf-8');

    for (const [key, value] of Object.entries(MOCK_IDS)) {
      expect(
        clientContent.includes(value),
        `MOCK_IDS.${key} (${value}) not found in client mock-ids.ts`
      ).toBe(true);
    }
  });

  it('client and server have same number of IDs', () => {
    const clientFilePath = resolve(__dirname, '../../../../apps/client/src/lib/mock-ids.ts');
    const clientContent = readFileSync(clientFilePath, 'utf-8');

    // Count UUID-like values in client file
    const clientUUIDs = clientContent.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
    );
    const serverCount = Object.keys(MOCK_IDS).length;

    expect(clientUUIDs?.length).toBe(serverCount);
  });
});
