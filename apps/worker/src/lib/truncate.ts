/**
 * Truncation discipline utility (EXT-CC6).
 *
 * The pre-2026-04 collectors had four bare `.slice(0, N)` calls that
 * silently capped finding bodies. The §8.3 audit found this caused
 * downstream consumers (BB-3 normalizer, BB-4 segmentation) to
 * confuse "value is exactly N chars" with "value was N+ chars and
 * we threw the rest away." This module replaces all of them.
 *
 * **Why byte-length, not char-length:** `String.prototype.slice` and
 * `.length` operate on UTF-16 code units, not bytes. A document
 * containing emoji or Hebrew characters can be byte-larger than its
 * `.length` suggests, so a naive `slice(0, 2000)` against a Hebrew
 * Apex comment can produce a body that's already over the byte cap
 * the caller actually wanted. We compute byte length via Buffer.
 *
 * **Why a struct return:** the caller needs both the (possibly
 * shortened) value AND a flag for whether truncation happened, so
 * the produced finding can carry an `evidenceRefs[].truncated`
 * marker. The struct return avoids a second function call to
 * "did the previous truncation actually happen?" and prevents
 * desync between the two.
 */

/**
 * Truncate a string to fit within `maxBytes` UTF-8 bytes, returning
 * the (possibly truncated) value, a boolean flag, and the original
 * byte size so consumers can render "(truncated from N bytes)".
 *
 * Properties:
 * - Idempotent: re-truncating an already-truncated value at the
 *   same cap returns it unchanged.
 * - UTF-8 safe: never splits a multi-byte sequence in the middle.
 *   The trailing partial character is dropped.
 * - Empty input: returns `{ value: '', wasTruncated: false, originalBytes: 0 }`.
 * - `maxBytes <= 0`: returns the empty value with `wasTruncated`
 *   set iff the input was non-empty (caller asked us to throw it
 *   all away — that IS truncation).
 */
export function truncateWithFlag(
  value: string,
  maxBytes: number
): { value: string; wasTruncated: boolean; originalBytes: number } {
  const originalBytes = Buffer.byteLength(value, 'utf8');

  // Fast path: under the cap.
  if (originalBytes <= maxBytes) {
    return { value, wasTruncated: false, originalBytes };
  }

  // Edge case: caller asked for nothing.
  if (maxBytes <= 0) {
    return { value: '', wasTruncated: value.length > 0, originalBytes };
  }

  // Encode to bytes, slice at the cap, then walk BACKWARDS to find
  // the last safe UTF-8 boundary. UTF-8 encoding rules:
  //   - 0xxxxxxx               → 1-byte ASCII (always safe)
  //   - 110xxxxx 10xxxxxx      → 2-byte sequence
  //   - 1110xxxx 10xxxxxx ×2   → 3-byte sequence
  //   - 11110xxx 10xxxxxx ×3   → 4-byte sequence (e.g. emoji)
  //   - 10xxxxxx               → continuation byte (NEVER a valid start)
  //
  // We start at `maxBytes` and walk backwards, dropping any
  // continuation bytes. When we hit a multi-byte START byte
  // (high bits `11`), we drop it too IF the full sequence wouldn't
  // fit within the cap. The result is always a valid UTF-8 prefix.
  //
  // We deliberately do NOT use TextDecoder({ fatal: false }) here:
  // its non-fatal mode REPLACES partial sequences with U+FFFD
  // (replacement char) rather than dropping them, which produces
  // a body that's still over the byte cap because U+FFFD is 3 bytes.
  const buf = Buffer.from(value, 'utf8');
  let cut = maxBytes;

  // Walk backwards through any continuation bytes (10xxxxxx).
  while (cut > 0 && (buf[cut - 1]! & 0xc0) === 0x80) {
    cut--;
  }
  // We're now sitting just after either an ASCII byte or a
  // multi-byte start byte. If it's a start byte, check whether
  // the full sequence fits within the original `maxBytes`. If it
  // does, ADVANCE cut to include the full sequence; if it doesn't,
  // RETREAT cut to drop the orphaned start byte.
  if (cut > 0) {
    const startByte = buf[cut - 1]!;
    let seqLen = 0;
    if ((startByte & 0xe0) === 0xc0)
      seqLen = 2; // 110xxxxx
    else if ((startByte & 0xf0) === 0xe0)
      seqLen = 3; // 1110xxxx
    else if ((startByte & 0xf8) === 0xf0) seqLen = 4; // 11110xxx
    if (seqLen > 0) {
      const fullSeqEnd = cut - 1 + seqLen; // index just past the sequence
      if (fullSeqEnd <= maxBytes) {
        // Full sequence fits within the cap — include it.
        cut = fullSeqEnd;
      } else {
        // Full sequence overflows — drop the orphaned start byte.
        cut--;
      }
    }
  }

  const truncated = buf.subarray(0, cut).toString('utf8');
  return { value: truncated, wasTruncated: true, originalBytes };
}
