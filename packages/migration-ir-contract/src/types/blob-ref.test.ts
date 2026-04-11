/**
 * BlobRef discriminated-union tests.
 */
import { describe, expect, it } from 'vitest';
import {
  blobContentOrNull,
  inlineBlob,
  isExternalBlob,
  isInlineBlob,
  utf8ByteLength,
  type BlobRef,
} from './blob-ref.ts';

describe('utf8ByteLength', () => {
  it('ASCII length matches string length', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('UTF-8 multi-byte characters count their byte length', () => {
    // 'é' is 2 bytes in UTF-8
    expect(utf8ByteLength('é')).toBe(2);
    // emoji is 4 bytes
    expect(utf8ByteLength('🎉')).toBe(4);
  });

  it('empty string is zero bytes', () => {
    expect(utf8ByteLength('')).toBe(0);
  });
});

describe('inlineBlob', () => {
  it('produces an InlineBlobRef with content + size', () => {
    const ref = inlineBlob('apex code');
    expect(ref.kind).toBe('inline');
    expect(ref.content).toBe('apex code');
    expect(ref.size).toBe(9);
  });

  it('size is computed in UTF-8 bytes, not JS string length', () => {
    const ref = inlineBlob('héllo');
    expect(ref.content.length).toBe(5);
    expect(ref.size).toBe(6); // é is 2 bytes
  });
});

describe('isInlineBlob / isExternalBlob', () => {
  it('isInlineBlob narrows correctly', () => {
    const inline: BlobRef = { kind: 'inline', content: 'foo', size: 3 };
    const external: BlobRef = { kind: 'external', contentHash: 'abc', size: 10 };
    expect(isInlineBlob(inline)).toBe(true);
    expect(isInlineBlob(external)).toBe(false);
  });

  it('isExternalBlob narrows correctly', () => {
    const inline: BlobRef = { kind: 'inline', content: 'foo', size: 3 };
    const external: BlobRef = { kind: 'external', contentHash: 'abc', size: 10 };
    expect(isExternalBlob(inline)).toBe(false);
    expect(isExternalBlob(external)).toBe(true);
  });
});

describe('blobContentOrNull', () => {
  it('returns content for inline refs', () => {
    expect(blobContentOrNull({ kind: 'inline', content: 'x', size: 1 })).toBe('x');
  });

  it('returns null for external refs', () => {
    expect(blobContentOrNull({ kind: 'external', contentHash: 'h', size: 1 })).toBeNull();
  });
});
