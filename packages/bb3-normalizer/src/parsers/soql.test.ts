import { describe, expect, it } from 'vitest';
import { extractSoqlFieldRefs } from './soql.ts';

describe('PH2.4 — extractSoqlFieldRefs', () => {
  it('extracts simple SELECT list', () => {
    const r = extractSoqlFieldRefs('SELECT Id, Name, Amount FROM Account');
    expect(r.parseStatus).toBe('parsed');
    expect(r.fromObject).toBe('Account');
    expect(r.selectFields.length).toBe(3);
    const fields = r.selectFields.map((f) => (f.kind === 'field' ? f.field : f.terminalField));
    expect(fields).toEqual(['Id', 'Name', 'Amount']);
  });

  it('handles case-insensitive SELECT/FROM keywords', () => {
    const r = extractSoqlFieldRefs('select Id from Account');
    expect(r.parseStatus).toBe('parsed');
    expect(r.fromObject).toBe('Account');
  });

  it('handles multi-line SOQL', () => {
    const r = extractSoqlFieldRefs(`
      SELECT Id, Name,
             Amount
      FROM SBQQ__Quote__c
    `);
    expect(r.parseStatus).toBe('parsed');
    expect(r.selectFields.length).toBe(3);
    expect(r.fromObject).toBe('SBQQ__Quote__c');
  });

  it('emits a path ref for Account__r.Owner.Name', () => {
    const r = extractSoqlFieldRefs('SELECT Account__r.Owner.Name FROM SBQQ__Quote__c');
    expect(r.selectFields.length).toBe(1);
    const ref = r.selectFields[0]!;
    expect(ref.kind).toBe('path');
    if (ref.kind === 'path') {
      expect(ref.rootObject).toBe('SBQQ__Quote__c');
      expect(ref.path).toEqual(['Account__r', 'Owner']);
      expect(ref.terminalField).toBe('Name');
    }
  });

  it('handles aggregate functions and tags with hint', () => {
    const r = extractSoqlFieldRefs('SELECT COUNT(Id) FROM Account');
    expect(r.selectFields.length).toBe(1);
    expect(r.selectFields[0]!.hint).toBe('aggregate:count');
  });

  it('aggregate with * is skipped', () => {
    const r = extractSoqlFieldRefs('SELECT COUNT(*) FROM Account');
    expect(r.selectFields.length).toBe(0);
  });

  it('marks partial when a subquery is present and skips the subquery', () => {
    const r = extractSoqlFieldRefs('SELECT Id, (SELECT Id FROM Contacts) FROM Account');
    expect(r.parseStatus).toBe('partial');
    expect(r.selectFields.length).toBe(1);
    expect(r.selectFields[0]!.kind === 'field' && r.selectFields[0]!.field).toBe('Id');
  });

  it('extracts WHERE clause field refs', () => {
    const r = extractSoqlFieldRefs(
      "SELECT Id FROM Account WHERE Name = 'Acme' AND Industry = 'Tech'"
    );
    expect(r.whereFields.length).toBeGreaterThanOrEqual(2);
    const names = r.whereFields.map((f) => (f.kind === 'field' ? f.field : f.terminalField));
    expect(names).toContain('Name');
    expect(names).toContain('Industry');
  });

  it('strips bind variables from WHERE clause', () => {
    const r = extractSoqlFieldRefs('SELECT Id FROM Account WHERE Id = :acctId');
    const names = r.whereFields.map((f) => (f.kind === 'field' ? f.field : f.terminalField));
    expect(names).not.toContain('acctId');
    expect(names).toContain('Id');
  });

  it('strips string literals so literals are not mistaken for fields', () => {
    const r = extractSoqlFieldRefs("SELECT Id FROM Account WHERE Name = 'Contains.Dot'");
    const names = r.whereFields.map((f) => (f.kind === 'field' ? f.field : f.terminalField));
    expect(names).toContain('Name');
    expect(names).not.toContain('Contains.Dot');
  });

  it('unparseable on garbage input', () => {
    const r = extractSoqlFieldRefs('this is not soql');
    expect(r.parseStatus).toBe('unparseable');
    expect(r.fromObject).toBeNull();
    expect(r.selectFields).toEqual([]);
  });

  it('unparseable on missing FROM', () => {
    const r = extractSoqlFieldRefs('SELECT Id');
    expect(r.parseStatus).toBe('unparseable');
  });

  it('filters out SOQL boolean keywords from WHERE tokens', () => {
    const r = extractSoqlFieldRefs('SELECT Id FROM Account WHERE IsActive = true AND Name != null');
    const names = r.whereFields.map((f) => (f.kind === 'field' ? f.field : f.terminalField));
    expect(names).not.toContain('true');
    expect(names).not.toContain('null');
    expect(names).toContain('IsActive');
    expect(names).toContain('Name');
  });
});
