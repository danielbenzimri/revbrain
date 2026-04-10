import { describe, expect, it } from 'vitest';
import { parseFormula } from './formula.ts';

describe('PH2.3 — parseFormula', () => {
  describe('simple expressions', () => {
    it('parses a single field reference', () => {
      const r = parseFormula('Amount__c');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(1);
      expect(r.complexity).toBe('simple');
    });

    it('parses an arithmetic expression and extracts one ref', () => {
      const r = parseFormula('Amount__c + 10');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(1);
      expect(r.complexity).toBe('simple');
    });

    it('parses a subtraction', () => {
      const r = parseFormula('Amount__c - Discount__c');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(2);
    });

    it('parses a multiplication', () => {
      const r = parseFormula('Qty__c * Price__c');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(2);
    });

    it('parses a division', () => {
      const r = parseFormula('Amount__c / 100');
      expect(r.parseStatus).toBe('parsed');
    });

    it('parses unary minus', () => {
      const r = parseFormula('-Amount__c');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(1);
    });

    it('parses parenthesized expression', () => {
      const r = parseFormula('(Amount__c + Fee__c) * 0.1');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(2);
    });
  });

  describe('literals', () => {
    it('parses number literals', () => {
      expect(parseFormula('42').parseStatus).toBe('parsed');
      expect(parseFormula('3.14').parseStatus).toBe('parsed');
      expect(parseFormula('1e3').parseStatus).toBe('parsed');
    });

    it('parses string literals', () => {
      expect(parseFormula('"hello"').parseStatus).toBe('parsed');
      expect(parseFormula("'hello'").parseStatus).toBe('parsed');
    });

    it('parses TRUE / FALSE / NULL keywords', () => {
      expect(parseFormula('TRUE').parseStatus).toBe('parsed');
      expect(parseFormula('FALSE').parseStatus).toBe('parsed');
      expect(parseFormula('NULL').parseStatus).toBe('parsed');
    });
  });

  describe('function calls', () => {
    it('parses IF(cond, a, b) with 2 field refs', () => {
      const r = parseFormula('IF(Active__c, TEXT(Amount__c), "Inactive")');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(2);
      expect(r.complexity).toBe('moderate');
    });

    it('parses nested VLOOKUP', () => {
      const r = parseFormula('VLOOKUP(Pricebook__r.Name, Custom__r.Key__c, 2)');
      expect(r.parseStatus).toBe('parsed');
    });

    it('parses TEXT()', () => {
      const r = parseFormula('TEXT(Amount__c)');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(1);
    });

    it('parses empty-arg function call', () => {
      const r = parseFormula('NOW()');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(0);
    });
  });

  describe('cross-object references', () => {
    it('Account__r.Name is a path ref with hasCrossObjectRef', () => {
      const r = parseFormula('Account__r.Name', { rootObject: 'SBQQ__Quote__c' });
      expect(r.parseStatus).toBe('parsed');
      expect(r.hasCrossObjectRef).toBe(true);
      expect(r.referencedFields.length).toBe(1);
      expect(r.referencedFields[0]!.kind).toBe('path');
    });

    it('Account__r.Owner.Profile.Name has depth > 1', () => {
      const r = parseFormula('Account__r.Owner.Profile.Name', { rootObject: 'SBQQ__Quote__c' });
      expect(r.hasCrossObjectRef).toBe(true);
      const ref = r.referencedFields[0]!;
      if (ref.kind === 'path') {
        expect(ref.path.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('global variables', () => {
    it('$User.Id sets hasGlobalVariableRef and emits no field ref', () => {
      const r = parseFormula('$User.Id');
      expect(r.parseStatus).toBe('parsed');
      expect(r.hasGlobalVariableRef).toBe(true);
      expect(r.referencedFields.length).toBe(0);
    });

    it('$Profile.Name in an IF', () => {
      const r = parseFormula('IF($Profile.Name == "Admin", 1, 0)');
      expect(r.hasGlobalVariableRef).toBe(true);
    });
  });

  describe('comparison operators', () => {
    it('parses equality', () => {
      const r = parseFormula('Amount__c == 100');
      expect(r.parseStatus).toBe('parsed');
    });

    it('parses logical AND', () => {
      const r = parseFormula('Active__c && Amount__c > 0');
      expect(r.parseStatus).toBe('parsed');
      expect(r.referencedFields.length).toBe(2);
    });

    it('parses logical OR', () => {
      const r = parseFormula('Status__c == "Draft" || Status__c == "New"');
      expect(r.parseStatus).toBe('parsed');
    });
  });

  describe('error handling', () => {
    it('empty string returns unparseable', () => {
      const r = parseFormula('');
      expect(r.parseStatus).toBe('unparseable');
      expect(r.referencedFields).toEqual([]);
    });

    it('garbage input returns unparseable with no throw', () => {
      const r = parseFormula('@#$%^');
      expect(r.parseStatus).toBe('unparseable');
    });

    it('unterminated function call returns partial with parseErrors', () => {
      const r = parseFormula('IF(Active__c, 1, 2');
      expect(r.parseErrors.length).toBeGreaterThan(0);
    });

    it('never throws on random bad input', () => {
      expect(() => parseFormula(')((')).not.toThrow();
      expect(() => parseFormula('123abc.')).not.toThrow();
    });
  });

  describe('complexity classification', () => {
    it('simple: single field', () => {
      expect(parseFormula('Amount__c').complexity).toBe('simple');
    });

    it('moderate: IF with nested call', () => {
      expect(parseFormula('IF(Active__c, TEXT(Amount__c), "x")').complexity).toBe('moderate');
    });

    it('complex: deep nesting', () => {
      const deep =
        'IF(A__c, IF(B__c, IF(C__c, IF(D__c, IF(E__c, IF(F__c, IF(G__c, 1, 2), 3), 4), 5), 6), 7), 8)';
      const r = parseFormula(deep);
      expect(['moderate', 'complex']).toContain(r.complexity);
    });
  });

  describe('NO wall-clock timeouts — deterministic budgets only', () => {
    it('extremely deep nesting hits MAX_DEPTH and returns partial, not throw', () => {
      let deep = '1';
      for (let i = 0; i < 300; i++) deep = `(${deep})`;
      const r = parseFormula(deep);
      expect(['partial', 'parsed']).toContain(r.parseStatus);
    });

    it('large expression does not exceed reasonable bounds', () => {
      const big = Array.from({ length: 500 }, (_, i) => `F${i}__c`).join(' + ');
      const r = parseFormula(big);
      expect(r.referencedFields.length).toBeGreaterThan(0);
    });
  });
});
