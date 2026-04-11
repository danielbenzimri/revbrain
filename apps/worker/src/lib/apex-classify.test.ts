/**
 * Unit tests for Apex source-classification helpers.
 */

import { describe, expect, it } from 'vitest';
import { isApexTestClass } from './apex-classify.ts';

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
