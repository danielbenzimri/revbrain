import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  encrypt,
  decrypt,
  deriveKey,
  generateEncryptionKey,
  parseEncryptionKey,
  ENCRYPTION_CONTEXTS,
} from './encryption.ts';

/**
 * Generate a valid 32-byte test key.
 * Each test gets its own key to prevent cross-test interference.
 */
function createTestKey(): Buffer {
  return crypto.randomBytes(32);
}

describe('encryption', () => {
  const context = ENCRYPTION_CONTEXTS.OAUTH_TOKEN;

  describe('encrypt + decrypt roundtrip', () => {
    it('should encrypt then decrypt to the original plaintext', () => {
      const key = createTestKey();
      const plaintext = 'access_token_00D5g00000XXXXX!AQEAQ.example';

      const blob = encrypt(plaintext, key, context);
      const result = decrypt(blob, key, context);

      expect(result).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const key = createTestKey();
      const plaintext = '';

      const blob = encrypt(plaintext, key, context);
      const result = decrypt(blob, key, context);

      expect(result).toBe('');
    });

    it('should handle long strings (10KB)', () => {
      const key = createTestKey();
      const plaintext = 'x'.repeat(10_240);

      const blob = encrypt(plaintext, key, context);
      const result = decrypt(blob, key, context);

      expect(result).toBe(plaintext);
      expect(result).toHaveLength(10_240);
    });

    it('should handle unicode characters', () => {
      const key = createTestKey();
      const plaintext = 'Hello 世界 🌍 مرحبا';

      const blob = encrypt(plaintext, key, context);
      const result = decrypt(blob, key, context);

      expect(result).toBe(plaintext);
    });
  });

  describe('uniqueness', () => {
    it('should produce different ciphertexts for different plaintexts', () => {
      const key = createTestKey();

      const blob1 = encrypt('plaintext_one', key, context);
      const blob2 = encrypt('plaintext_two', key, context);

      expect(blob1.equals(blob2)).toBe(false);
    });

    it('should produce different ciphertexts for the same plaintext (unique IVs)', () => {
      const key = createTestKey();
      const plaintext = 'same_token_value';

      const blob1 = encrypt(plaintext, key, context);
      const blob2 = encrypt(plaintext, key, context);

      expect(blob1.equals(blob2)).toBe(false);

      // Both should still decrypt to the same plaintext
      expect(decrypt(blob1, key, context)).toBe(plaintext);
      expect(decrypt(blob2, key, context)).toBe(plaintext);
    });
  });

  describe('tamper detection', () => {
    it('should throw when ciphertext is tampered with', () => {
      const key = createTestKey();
      const blob = encrypt('sensitive_data', key, context);

      // Tamper with one byte in the middle of the ciphertext (after IV, before auth tag)
      const tampered = Buffer.from(blob);
      const tamperIndex = 12 + Math.floor((blob.length - 28) / 2);
      tampered[tamperIndex] = tampered[tamperIndex]! ^ 0xff;

      expect(() => decrypt(tampered, key, context)).toThrow();
    });

    it('should throw when auth tag is tampered with', () => {
      const key = createTestKey();
      const blob = encrypt('sensitive_data', key, context);

      const tampered = Buffer.from(blob);
      tampered[blob.length - 1] = tampered[blob.length - 1]! ^ 0xff;

      expect(() => decrypt(tampered, key, context)).toThrow();
    });

    it('should throw when IV is tampered with', () => {
      const key = createTestKey();
      const blob = encrypt('sensitive_data', key, context);

      const tampered = Buffer.from(blob);
      tampered[0] = tampered[0]! ^ 0xff;

      expect(() => decrypt(tampered, key, context)).toThrow();
    });
  });

  describe('key and context isolation', () => {
    it('should throw when decrypting with the wrong master key', () => {
      const key1 = createTestKey();
      const key2 = createTestKey();

      const blob = encrypt('secret', key1, context);

      expect(() => decrypt(blob, key2, context)).toThrow();
    });

    it('should throw when decrypting with the wrong context', () => {
      const key = createTestKey();

      const blob = encrypt('secret', key, ENCRYPTION_CONTEXTS.OAUTH_TOKEN);

      expect(() => decrypt(blob, key, ENCRYPTION_CONTEXTS.BROWSER_CRED)).toThrow();
    });
  });

  describe('blob format', () => {
    it('should produce blob with correct structure: IV(12) || ciphertext || authTag(16)', () => {
      const key = createTestKey();
      const plaintext = 'test_value';
      const plaintextBytes = Buffer.byteLength(plaintext, 'utf8');

      const blob = encrypt(plaintext, key, context);

      // IV (12) + ciphertext (same length as plaintext for GCM) + authTag (16)
      expect(blob.length).toBe(12 + plaintextBytes + 16);

      // First 12 bytes = IV (should be different from zeros)
      const iv = blob.subarray(0, 12);
      expect(iv.equals(Buffer.alloc(12))).toBe(false);
    });

    it('should reject blob that is too short', () => {
      const key = createTestKey();
      const tooShort = Buffer.alloc(27); // Less than IV(12) + authTag(16) = 28 minimum

      expect(() => decrypt(tooShort, key, context)).toThrow('too short');
    });
  });

  describe('deriveKey', () => {
    it('should produce deterministic output for same inputs', () => {
      const key = createTestKey();

      const derived1 = deriveKey(key, 'test_context');
      const derived2 = deriveKey(key, 'test_context');

      expect(Buffer.compare(derived1, derived2)).toBe(0);
    });

    it('should produce different keys for different contexts', () => {
      const key = createTestKey();

      const derived1 = deriveKey(key, ENCRYPTION_CONTEXTS.OAUTH_TOKEN);
      const derived2 = deriveKey(key, ENCRYPTION_CONTEXTS.BROWSER_CRED);

      expect(Buffer.compare(derived1, derived2)).not.toBe(0);
    });

    it('should produce a 32-byte Buffer', () => {
      const key = createTestKey();
      const derived = deriveKey(key, 'any_context');

      expect(Buffer.isBuffer(derived)).toBe(true);
      expect(derived.length).toBe(32);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a valid base64-encoded 32-byte key', () => {
      const keyBase64 = generateEncryptionKey();
      const keyBuffer = Buffer.from(keyBase64, 'base64');

      expect(keyBuffer.length).toBe(32);
    });

    it('should generate unique keys on each call', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('parseEncryptionKey', () => {
    it('should parse a valid base64 key', () => {
      const original = crypto.randomBytes(32);
      const base64 = original.toString('base64');

      const parsed = parseEncryptionKey(base64);

      expect(parsed.equals(original)).toBe(true);
      expect(parsed.length).toBe(32);
    });

    it('should throw for empty string', () => {
      expect(() => parseEncryptionKey('')).toThrow('empty');
    });

    it('should throw for whitespace-only string', () => {
      expect(() => parseEncryptionKey('   ')).toThrow('empty');
    });

    it('should throw for key with wrong length', () => {
      const shortKey = crypto.randomBytes(16).toString('base64');
      expect(() => parseEncryptionKey(shortKey)).toThrow('32 bytes');
    });
  });
});
