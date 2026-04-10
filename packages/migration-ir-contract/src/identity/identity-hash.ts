/**
 * identityHash + buildIdentityPair — BB-3's stable-identity hashing.
 *
 * Spec: §5.2, §8.1.
 *
 * Every IR node carries TWO hashes:
 *
 * - `id`          — stable under rename + sandbox refresh; used by
 *                   BB-17 (re-assessment differ) to match nodes
 *                   across re-runs.
 * - `contentHash` — changes iff behavior-relevant content changes;
 *                   used to detect when an SI has edited an artifact
 *                   since the last normalize.
 *
 * The `purpose` parameter is a domain separator: it makes it
 * impossible for an `id` hash and a `contentHash` to collide by
 * construction, even on identical payloads.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.ts';
import type { IRNodeType } from '../types/nodes.ts';

/** A node's identity pair — both hashes produced by the normalizer. */
export interface IdentityPair {
  /** Stable across re-runs, sandbox refreshes, and cosmetic edits. */
  id: string;
  /** Changes iff the node's semantically relevant content changes. */
  contentHash: string;
}

/** Hash purpose — the domain separator for identity vs content hashes. */
export type HashPurpose = 'id' | 'contentHash';

/**
 * URL-safe base64 encoding of a byte buffer. We roll this by hand
 * rather than calling `Buffer.toString('base64url')` so the code is
 * trivially portable — there is nothing interesting about the
 * conversion and no reason to depend on a specific Node version.
 */
function base64url(bytes: Uint8Array): string {
  // Convert to standard base64 via Buffer, then swap the unsafe chars.
  // Buffer is ubiquitous in Node 20+ (our engine target).
  const b64 = Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Produce a stable identity hash for a node's business identity OR
 * its semantic content. The output is a 22-character URL-safe
 * base64 string representing the first 128 bits of a SHA-256 digest.
 *
 * At 128 bits, the collision probability is < 10⁻⁹ at 1 billion
 * nodes — comfortable for any realistic extraction.
 */
export function identityHash(nodeType: IRNodeType, purpose: HashPurpose, payload: unknown): string {
  // Wrap the payload with the discriminators so the same payload
  // can never collide across (nodeType, purpose) pairs.
  const canonical = canonicalJson({ nodeType, purpose, payload });
  const digest = createHash('sha256').update(canonical, 'utf8').digest();
  return base64url(digest.subarray(0, 16));
}

/**
 * Convenience wrapper — build both hashes for a node in one call.
 * Normalizers call this once per draft node with two payloads:
 * one describing the stable identity (passed to `id`) and one
 * describing the semantically relevant content (passed to
 * `contentHash`).
 */
export function buildIdentityPair(
  nodeType: IRNodeType,
  stableIdentity: unknown,
  semanticPayload: unknown
): IdentityPair {
  return {
    id: identityHash(nodeType, 'id', stableIdentity),
    contentHash: identityHash(nodeType, 'contentHash', semanticPayload),
  };
}
