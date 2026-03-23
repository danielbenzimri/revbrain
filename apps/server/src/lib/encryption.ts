/**
 * AES-256-GCM encryption with HKDF key derivation.
 *
 * Used for encrypting Salesforce tokens and browser automation credentials.
 * Each encrypted field gets its own unique IV — reusing IVs under AES-GCM
 * is catastrophic (breaks confidentiality and authenticity).
 *
 * Output format per field: IV(12 bytes) || ciphertext || authTag(16 bytes)
 * stored as a single Buffer/BYTEA column in the database.
 *
 * Different data classes use different HKDF-derived keys via context strings
 * so that compromising one class doesn't expose another.
 */

import crypto from 'node:crypto';

/**
 * Encryption context strings for HKDF key derivation.
 * Each context produces a different derived key from the same master key.
 */
export const ENCRYPTION_CONTEXTS = {
  OAUTH_TOKEN: 'revbrain:oauth_token',
  BROWSER_CRED: 'revbrain:browser_cred',
  JWT_BEARER: 'revbrain:jwt_bearer',
} as const;

export type EncryptionContext = (typeof ENCRYPTION_CONTEXTS)[keyof typeof ENCRYPTION_CONTEXTS];

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DERIVED_KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm' as const;

/**
 * Derive a 256-bit encryption key from a master key using HKDF-SHA256.
 *
 * Different context strings produce different derived keys, enabling
 * key separation between data classes (OAuth tokens vs browser credentials).
 */
export function deriveKey(masterKey: Buffer, context: string): Buffer {
  const derived = crypto.hkdfSync(
    'sha256',
    masterKey,
    Buffer.alloc(0),
    context,
    DERIVED_KEY_LENGTH
  );
  return Buffer.from(derived);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns a single Buffer: IV(12) || ciphertext || authTag(16).
 * A fresh random IV is generated for every call — never reused.
 *
 * @param plaintext - The string to encrypt
 * @param masterKey - 32-byte master key (from env var, base64-decoded)
 * @param context - HKDF context string for key derivation
 * @returns Buffer containing IV + ciphertext + auth tag
 */
export function encrypt(plaintext: string, masterKey: Buffer, context: string): Buffer {
  const derivedKey = deriveKey(masterKey, context);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]);
}

/**
 * Decrypt a blob previously encrypted with `encrypt()`.
 *
 * Expects the format: IV(12) || ciphertext || authTag(16).
 * Throws if the blob is tampered with, the key is wrong, or the context differs.
 *
 * @param blob - Buffer containing IV + ciphertext + auth tag
 * @param masterKey - Same 32-byte master key used for encryption
 * @param context - Same HKDF context string used for encryption
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (tampered data, wrong key, wrong context)
 */
export function decrypt(blob: Buffer, masterKey: Buffer, context: string): string {
  if (blob.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted blob is too short to contain valid data');
  }

  const derivedKey = deriveKey(masterKey, context);
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Generate a new 256-bit encryption key as a base64 string.
 *
 * Use this for initial key generation:
 *   SALESFORCE_TOKEN_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
 *
 * Or call this function and set the result as an env var.
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(DERIVED_KEY_LENGTH).toString('base64');
}

/**
 * Parse a base64-encoded encryption key from an environment variable.
 * Validates that the key is exactly 32 bytes (256 bits).
 *
 * @throws Error if the key is missing, empty, or not 32 bytes
 */
export function parseEncryptionKey(base64Key: string): Buffer {
  if (!base64Key || base64Key.trim().length === 0) {
    throw new Error('Encryption key is empty');
  }

  const keyBuffer = Buffer.from(base64Key, 'base64');

  if (keyBuffer.length !== DERIVED_KEY_LENGTH) {
    throw new Error(
      `Encryption key must be exactly ${DERIVED_KEY_LENGTH} bytes (${DERIVED_KEY_LENGTH * 8} bits), got ${keyBuffer.length} bytes`
    );
  }

  return keyBuffer;
}
