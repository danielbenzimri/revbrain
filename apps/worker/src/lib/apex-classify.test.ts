/**
 * Unit tests for Apex source-classification helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  CPQ_PLUGIN_INTERFACE_MAP,
  detectApexDynamicDispatch,
  detectCpqPluginInterfaces,
  detectQcpDynamicDispatch,
  isApexTestClass,
} from './apex-classify.ts';

describe('isApexTestClass', () => {
  it('detects @isTest annotation at class level (lowercase)', () => {
    expect(isApexTestClass('@isTest\npublic class FooTest { }')).toBe(true);
  });

  it('detects @IsTest annotation (mixed case)', () => {
    expect(isApexTestClass('@IsTest\npublic class FooTest { }')).toBe(true);
  });

  it('detects @ISTEST annotation (uppercase)', () => {
    expect(isApexTestClass('@ISTEST\npublic class FooTest { }')).toBe(true);
  });

  it('detects @isTest with arguments', () => {
    expect(isApexTestClass('@isTest(seeAllData=true)\npublic class FooTest { }')).toBe(true);
  });

  it('detects @isTest on a method inside a non-test class', () => {
    // A class with a test method is still test-only — production
    // code does not annotate its methods with @isTest.
    expect(
      isApexTestClass(`public class FooHelper {
  @isTest
  static void testFoo() { }
}`)
    ).toBe(true);
  });

  it('returns false for a production class with no test annotation', () => {
    expect(isApexTestClass('public class QuoteCalculator { void compute() { } }')).toBe(false);
  });

  it('returns false for empty body', () => {
    expect(isApexTestClass('')).toBe(false);
  });

  it('matches @isTest with word boundary (does not match @isTesting)', () => {
    expect(isApexTestClass('public class Foo { String x = "@isTesting"; }')).toBe(false);
  });
});

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

  it('returns empty for a class with no plugin interface', () => {
    const body = 'public class NotAPlugin { void doStuff() { } }';
    expect(detectCpqPluginInterfaces(body)).toEqual([]);
  });

  it('returns empty for a class implementing a non-CPQ interface', () => {
    const body = 'public class Foo implements Comparable { }';
    expect(detectCpqPluginInterfaces(body)).toEqual([]);
  });

  it('handles ConfiguratorPluginInterface', () => {
    const body = 'public class CfgPlugin implements SBQQ.ConfiguratorPluginInterface { }';
    expect(detectCpqPluginInterfaces(body)).toEqual(['SBQQ.ConfiguratorPluginInterface']);
  });

  it('handles a class extending and implementing', () => {
    const body =
      'public class FancyPlugin extends BasePlugin implements SBQQ.QuoteCalculatorPluginInterface { }';
    expect(detectCpqPluginInterfaces(body)).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('handles with sharing modifier', () => {
    const body =
      'public with sharing class FancyPlugin implements SBQQ.QuoteCalculatorPluginInterface { }';
    expect(detectCpqPluginInterfaces(body)).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('dedupes when the same interface appears twice in the body (e.g. inner classes)', () => {
    const body = `public class Outer implements SBQQ.QuoteCalculatorPluginInterface {
  public class Inner implements SBQQ.QuoteCalculatorPluginInterface { }
}`;
    expect(detectCpqPluginInterfaces(body)).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('does not match interfaces inside string literals (the lookahead saves us)', () => {
    // The regex requires the interface list to terminate at `{`,
    // `extends`, sharing modifier, or `;`. A string literal is
    // followed by `;` after the closing quote, so the captured
    // group "implements SBQQ.QuoteCalculatorPluginInterface" stops
    // at `;` and the trim/split processes a single token —
    // BUT the surrounding `"` quotes mean the regex's `\b` word
    // boundary discipline keeps the match clean. This is more
    // robust than expected for a regex; tree-sitter is reserved
    // for BB-3b in case we need it.
    const body =
      'public class Foo { String x = "implements SBQQ.QuoteCalculatorPluginInterface"; }';
    expect(detectCpqPluginInterfaces(body)).toEqual([]);
  });
});

describe('detectApexDynamicDispatch (EXT-CC3)', () => {
  it('detects Type.forName', () => {
    expect(detectApexDynamicDispatch('Object o = Type.forName("Foo").newInstance();')).toContain(
      'Type.forName'
    );
  });

  it('detects Database.query', () => {
    expect(
      detectApexDynamicDispatch('List<SObject> r = Database.query("SELECT Id FROM Account");')
    ).toContain('Database.query');
  });

  it('detects multiple patterns and dedupes', () => {
    const body = `
      Type t = Type.forName(s);
      List<SObject> r = Database.query(soql);
      Database.QueryLocator loc = Database.queryLocator(soql);
    `;
    expect(detectApexDynamicDispatch(body)).toEqual([
      'Database.query',
      'Database.queryLocator',
      'Type.forName',
    ]);
  });

  it('returns empty for static-only Apex', () => {
    expect(
      detectApexDynamicDispatch('Account a = [SELECT Id FROM Account WHERE Id = :acctId];')
    ).toEqual([]);
  });
});

describe('detectQcpDynamicDispatch (EXT-CC3 with v1.1 conn.query)', () => {
  it('detects eval()', () => {
    expect(detectQcpDynamicDispatch('const x = eval(userExpr);')).toContain('eval');
  });

  it('detects new Function()', () => {
    expect(
      detectQcpDynamicDispatch('const fn = new Function("a", "b", "return a + b");')
    ).toContain('new Function');
  });

  it('detects dynamic import()', () => {
    expect(detectQcpDynamicDispatch('const mod = await import(modPath);')).toContain(
      'dynamic import'
    );
  });

  it('detects conn.query() — the v1.1 critical addition', () => {
    expect(
      detectQcpDynamicDispatch('const records = await conn.query("SELECT Id FROM Account");')
    ).toContain('conn.query');
  });

  it('detects multi-pattern QCP body and dedupes', () => {
    const body = `
      const records = await conn.query(dynSoql);
      const fn = new Function('return ' + expr);
      eval(extraCode);
    `;
    expect(detectQcpDynamicDispatch(body)).toEqual(['conn.query', 'eval', 'new Function']);
  });

  it('returns empty for static-only QCP code', () => {
    expect(
      detectQcpDynamicDispatch('function calculate(quote) { return quote.SBQQ__NetAmount__c * 2; }')
    ).toEqual([]);
  });
});

describe('CPQ_PLUGIN_INTERFACE_MAP', () => {
  it('exposes well-known CPQ + sbaa interfaces', () => {
    expect(CPQ_PLUGIN_INTERFACE_MAP['SBQQ.QuoteCalculatorPluginInterface']).toBeDefined();
    expect(CPQ_PLUGIN_INTERFACE_MAP['SBQQ.ConfiguratorPluginInterface']).toBeDefined();
    expect(CPQ_PLUGIN_INTERFACE_MAP['sbaa.IApprovalCondition']).toBeDefined();
  });

  it('every entry has both rcaTargetConcept and rcaMappingComplexity', () => {
    for (const [name, mapping] of Object.entries(CPQ_PLUGIN_INTERFACE_MAP)) {
      expect(mapping.rcaTargetConcept, name).toBeTruthy();
      expect(mapping.rcaMappingComplexity, name).toBeTruthy();
    }
  });

  it('is frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(CPQ_PLUGIN_INTERFACE_MAP)).toBe(true);
  });
});
