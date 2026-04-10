import { describe, expect, it } from 'vitest';
import type { Diagnostic, DiagnosticStage } from './diagnostic.ts';
import { BB3InputError, BB3InternalError } from './errors.ts';

describe('PH0.8 — Diagnostic + error classes', () => {
  describe('Diagnostic shape', () => {
    it('type-checks a validator-stage error', () => {
      const d: Diagnostic = {
        severity: 'error',
        stage: 'validate',
        code: 'BB3_V001',
        message: 'Inline NodeRef count does not match projected edge count',
        nodeId: 'node-a',
      };
      expect(d.severity).toBe('error');
      expect(d.stage).toBe('validate');
    });

    it.each<DiagnosticStage>([
      'input-gate',
      'group-index',
      'normalize',
      'resolve-refs',
      'parse-code',
      'detect-cycles',
      'build-index',
      'validate',
      'assemble',
    ])('accepts stage %s', (stage) => {
      const d: Diagnostic = {
        severity: 'info',
        stage,
        code: 'BB3_I001',
        message: 'stage start',
      };
      expect(d.stage).toBe(stage);
    });
  });

  describe('BB3InputError', () => {
    it('is throwable and catchable via instanceof', () => {
      let caught: unknown;
      try {
        throw new BB3InputError('input is not an array');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BB3InputError);
      expect(caught).toBeInstanceOf(Error);
      expect((caught as BB3InputError).message).toBe('input is not an array');
      expect((caught as BB3InputError).name).toBe('BB3InputError');
    });

    it('preserves a structured detail payload', () => {
      const err = new BB3InputError('malformed', { invalidCount: 12, sampleCodes: ['BB3_Q001'] });
      expect(err.detail).toEqual({ invalidCount: 12, sampleCodes: ['BB3_Q001'] });
    });
  });

  describe('BB3InternalError', () => {
    it('is throwable and catchable via instanceof', () => {
      let caught: unknown;
      try {
        throw new BB3InternalError('unreachable case in normalizer switch');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BB3InternalError);
      expect(caught).toBeInstanceOf(Error);
      expect((caught as BB3InternalError).name).toBe('BB3InternalError');
    });

    it('is distinct from BB3InputError at the type level', () => {
      const internal: unknown = new BB3InternalError('bug');
      expect(internal instanceof BB3InputError).toBe(false);
      expect(internal instanceof BB3InternalError).toBe(true);
    });
  });
});
