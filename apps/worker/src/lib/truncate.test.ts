/**
 * Unit tests for the truncation discipline utility (EXT-CC6).
 *
 * The §8.3 audit lesson: every test that mutates a "size" value
 * must include a multi-byte character case. The pre-fix code
 * silently mistruncated emoji + Hebrew + Chinese + Apex unicode
 * comments because it was using `.slice` (UTF-16 code units)
 * instead of byte-aware truncation.
 */

import { describe, expect, it } from 'vitest';
import { truncateWithFlag } from './truncate.ts';

describe('truncateWithFlag', () => {
  it('returns the input unchanged when under the cap', () => {
    const result = truncateWithFlag('hello', 10);
    expect(result.value).toBe('hello');
    expect(result.wasTruncated).toBe(false);
    expect(result.originalBytes).toBe(5);
  });

  it('returns the input unchanged when exactly at the cap', () => {
    const result = truncateWithFlag('hello', 5);
    expect(result.value).toBe('hello');
    expect(result.wasTruncated).toBe(false);
    expect(result.originalBytes).toBe(5);
  });

  it('truncates and flags when over the cap', () => {
    const result = truncateWithFlag('hello world', 5);
    expect(result.value).toBe('hello');
    expect(result.wasTruncated).toBe(true);
    expect(result.originalBytes).toBe(11);
  });

  it('handles empty string', () => {
    const result = truncateWithFlag('', 100);
    expect(result.value).toBe('');
    expect(result.wasTruncated).toBe(false);
    expect(result.originalBytes).toBe(0);
  });

  it('returns empty value when maxBytes is 0 and input is non-empty', () => {
    const result = truncateWithFlag('hello', 0);
    expect(result.value).toBe('');
    expect(result.wasTruncated).toBe(true);
    expect(result.originalBytes).toBe(5);
  });

  it('returns empty unflagged when maxBytes is 0 and input is empty', () => {
    const result = truncateWithFlag('', 0);
    expect(result.value).toBe('');
    expect(result.wasTruncated).toBe(false);
    expect(result.originalBytes).toBe(0);
  });

  it('handles negative maxBytes the same as 0', () => {
    const result = truncateWithFlag('hello', -1);
    expect(result.value).toBe('');
    expect(result.wasTruncated).toBe(true);
    expect(result.originalBytes).toBe(5);
  });

  it('does not split multi-byte UTF-8 sequences', () => {
    // 'Ω' is two bytes in UTF-8 (0xCE 0xA9). Cap of 1 byte must
    // produce empty, not half a multi-byte sequence.
    const result = truncateWithFlag('Ω', 1);
    expect(result.value).toBe('');
    expect(result.wasTruncated).toBe(true);
    expect(result.originalBytes).toBe(2);
  });

  it('handles emoji (4-byte sequence) correctly — cap exactly fits the emoji', () => {
    // '😀' is 4 bytes in UTF-8.
    const original = 'a😀b';
    const originalBytes = Buffer.byteLength(original, 'utf8'); // 1 + 4 + 1 = 6
    expect(originalBytes).toBe(6);

    // Cap at 5: 'a' (1) + entire emoji (4) = 5 bytes. The trailing
    // 'b' is dropped but the emoji is kept — there's no need to
    // sacrifice it because the cap is exactly large enough.
    const result = truncateWithFlag(original, 5);
    expect(result.wasTruncated).toBe(true);
    expect(result.originalBytes).toBe(6);
    expect(result.value).toBe('a😀');
  });

  it('handles emoji (4-byte sequence) when cap splits the emoji', () => {
    // Same input but cap of 4: 'a' (1) + first 3 bytes of emoji.
    // The emoji's start byte is at position 1 (length 4). cut = 4
    // sits inside the emoji (at byte 4 which is the LAST byte).
    // Walk back: byte at cut-1 = byte 3 = continuation, drop. cut = 3.
    // byte 2 = continuation, drop. cut = 2. byte 1 = continuation,
    // drop. cut = 1. byte 0 = 'a' = ASCII = stop. Result: 'a'.
    const result = truncateWithFlag('a😀b', 4);
    expect(result.wasTruncated).toBe(true);
    expect(result.originalBytes).toBe(6);
    expect(result.value).toBe('a');
  });

  it('handles Hebrew text (2-byte chars) correctly', () => {
    // Hebrew aleph 'א' is 2 bytes.
    const original = 'אבגד'; // 8 bytes
    const result = truncateWithFlag(original, 4);
    expect(result.wasTruncated).toBe(true);
    expect(result.originalBytes).toBe(8);
    expect(result.value).toBe('אב'); // exactly 4 bytes
  });

  it('is idempotent: re-truncating already-truncated value is a no-op', () => {
    const first = truncateWithFlag('hello world', 5);
    const second = truncateWithFlag(first.value, 5);
    expect(second.value).toBe(first.value);
    expect(second.wasTruncated).toBe(false);
  });

  it('originalBytes reflects the source, not the truncated output', () => {
    const result = truncateWithFlag('a'.repeat(1000), 100);
    expect(result.value.length).toBe(100);
    expect(result.originalBytes).toBe(1000);
  });
});
