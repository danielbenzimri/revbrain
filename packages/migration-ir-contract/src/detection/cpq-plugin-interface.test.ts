/**
 * Tests for the shared CPQ plugin interface detection helper.
 * This is the source of truth — both `apps/worker` and the BB-3
 * normalizer call into this module, so the cases here cover ALL
 * the patterns either consumer needs.
 */
import { describe, expect, it } from 'vitest';
import {
  CPQ_PLUGIN_INTERFACE_NAME_PATTERN,
  detectCpqPluginInterfaces,
  IMPLEMENTS_PATTERN,
} from './cpq-plugin-interface.ts';

describe('detectCpqPluginInterfaces', () => {
  it('detects a single QuoteCalculatorPluginInterface implementation', () => {
    const body = `public class AcmePricing implements SBQQ.QuoteCalculatorPluginInterface {
  public void calculate(SBQQ__Quote__c quote) { }
}`;
    expect(detectCpqPluginInterfaces(body)).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('detects multi-interface implementations', () => {
    const body = `public class Multi implements SBQQ.QuoteCalculatorPluginInterface, sbaa.IApprovalCondition {
  // ...
}`;
    expect(detectCpqPluginInterfaces(body)).toEqual([
      'SBQQ.QuoteCalculatorPluginInterface',
      'sbaa.IApprovalCondition',
    ]);
  });

  it('returns empty for empty body', () => {
    expect(detectCpqPluginInterfaces('')).toEqual([]);
  });

  it('returns empty for a class with no plugin interface', () => {
    expect(detectCpqPluginInterfaces('public class NotAPlugin { }')).toEqual([]);
  });

  it('returns empty for non-namespaced interfaces (Comparable, etc.)', () => {
    expect(detectCpqPluginInterfaces('public class Foo implements Comparable { }')).toEqual([]);
  });

  it('handles ConfiguratorPluginInterface', () => {
    expect(
      detectCpqPluginInterfaces('public class Cfg implements SBQQ.ConfiguratorPluginInterface { }')
    ).toEqual(['SBQQ.ConfiguratorPluginInterface']);
  });

  it('handles class extending and implementing', () => {
    expect(
      detectCpqPluginInterfaces(
        'public class Fancy extends BasePlugin implements SBQQ.QuoteCalculatorPluginInterface { }'
      )
    ).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('handles with sharing modifier', () => {
    expect(
      detectCpqPluginInterfaces(
        'public with sharing class Fancy implements SBQQ.QuoteCalculatorPluginInterface { }'
      )
    ).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('dedupes when the same interface appears multiple times (inner classes)', () => {
    const body = `public class Outer implements SBQQ.QuoteCalculatorPluginInterface {
  public class Inner implements SBQQ.QuoteCalculatorPluginInterface { }
}`;
    expect(detectCpqPluginInterfaces(body)).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('returns sorted results (deterministic order)', () => {
    const body = `public class Z implements sbaa.IApprovalCondition, SBQQ.ConfiguratorPluginInterface { }`;
    const result = detectCpqPluginInterfaces(body);
    expect(result).toEqual(['SBQQ.ConfiguratorPluginInterface', 'sbaa.IApprovalCondition']);
  });

  it('does not match when interface clause is inside a string literal terminated by `;`', () => {
    // The lookahead in IMPLEMENTS_PATTERN treats `;` as a clause
    // terminator. The trim/split then drops the trailing `"` which
    // does not satisfy the namespace validator regex.
    const body =
      'public class Foo { String x = "implements SBQQ.QuoteCalculatorPluginInterface"; }';
    expect(detectCpqPluginInterfaces(body)).toEqual([]);
  });

  it('exports IMPLEMENTS_PATTERN as a global, multi-match regex', () => {
    expect(IMPLEMENTS_PATTERN.global).toBe(true);
    expect(IMPLEMENTS_PATTERN.ignoreCase).toBe(true);
  });

  it('CPQ_PLUGIN_INTERFACE_NAME_PATTERN matches valid namespaced names only', () => {
    expect(CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test('SBQQ.QuoteCalculatorPluginInterface')).toBe(
      true
    );
    expect(CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test('sbaa.IApprovalCondition')).toBe(true);
    expect(CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test('SBQQ.QuoteCalculatorPluginInterface2')).toBe(
      true
    );
    expect(CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test('Comparable')).toBe(false);
    expect(CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test('SBQQ.')).toBe(false);
    expect(CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test('SBQQ.123Bad')).toBe(false);
    expect(CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test('blng.Foo')).toBe(false); // not in our scope
  });

  it('is determinstic — same input produces same output across calls', () => {
    const body = 'public class Foo implements SBQQ.QuoteCalculatorPluginInterface { }';
    const a = detectCpqPluginInterfaces(body);
    const b = detectCpqPluginInterfaces(body);
    const c = detectCpqPluginInterfaces(body);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});
