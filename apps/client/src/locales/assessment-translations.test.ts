/**
 * Assessment translation parity tests
 *
 * Ensures en/assessment.json and he/assessment.json have identical key structures
 * and no empty values.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import en from './en/assessment.json';
import he from './he/assessment.json';

type JsonValue = string | number | boolean | null | JsonObj;
interface JsonObj { [key: string]: JsonValue }

/**
 * Recursively extracts all dot-notation keys from a nested object.
 */
function getKeys(obj: JsonObj, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getKeys(value as JsonObj, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

/**
 * Recursively checks that no string values are empty.
 */
function getEmptyKeys(obj: JsonObj, prefix = ''): string[] {
  const empty: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      empty.push(...getEmptyKeys(value as JsonObj, fullKey));
    } else if (typeof value === 'string' && value.trim() === '') {
      empty.push(fullKey);
    }
  }
  return empty;
}

describe('Assessment translation parity', () => {
  const enKeys = getKeys(en as unknown as JsonObj);
  const heKeys = getKeys(he as unknown as JsonObj);

  it('English and Hebrew have the same number of keys', () => {
    expect(enKeys.length).toBe(heKeys.length);
  });

  it('every English key exists in Hebrew', () => {
    const heKeySet = new Set(heKeys);
    const missing = enKeys.filter((k) => !heKeySet.has(k));
    expect(missing).toEqual([]);
  });

  it('every Hebrew key exists in English', () => {
    const enKeySet = new Set(enKeys);
    const missing = heKeys.filter((k) => !enKeySet.has(k));
    expect(missing).toEqual([]);
  });

  it('no empty string values in English', () => {
    const empty = getEmptyKeys(en as unknown as JsonObj);
    expect(empty).toEqual([]);
  });

  it('no empty string values in Hebrew', () => {
    const empty = getEmptyKeys(he as unknown as JsonObj);
    expect(empty).toEqual([]);
  });

  it('tab name keys cover all 10 domain tabs', () => {
    const expectedTabs = [
      'overview', 'products', 'pricing', 'rules', 'code',
      'integrations', 'amendments', 'approvals', 'documents', 'dataReporting',
    ];
    for (const tab of expectedTabs) {
      expect(enKeys).toContain(`tabs.${tab}`);
      expect(heKeys).toContain(`tabs.${tab}`);
    }
  });

  it('Hebrew strings differ from English (not just copied)', () => {
    // Check a sample of keys to ensure Hebrew is actually translated
    const sampleKeys = ['title', 'tabs.overview', 'tabs.products', 'migrationStatus.auto', 'complexity.low'];
    for (const key of sampleKeys) {
      const enValue = key.split('.').reduce((obj: JsonValue, k) => (obj as JsonObj)[k], en as unknown as JsonValue) as string;
      const heValue = key.split('.').reduce((obj: JsonValue, k) => (obj as JsonObj)[k], he as unknown as JsonValue) as string;
      expect(enValue).not.toBe(heValue);
    }
  });

  it('has at least 100 translation keys', () => {
    // Ensure comprehensive coverage
    expect(enKeys.length).toBeGreaterThanOrEqual(100);
  });
});
