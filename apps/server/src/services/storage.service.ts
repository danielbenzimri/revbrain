/**
 * Storage Service
 *
 * Handles file uploads to Supabase Storage with validation
 * and organization-scoped paths.
 */

import { getSupabaseAdmin } from '../lib/supabase.ts';
import { logger } from '../lib/logger.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';

/** Decode base64 string to Uint8Array using web-standard APIs (works in Node.js + Deno) */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// TYPES
// ============================================================================

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export interface SignatureUploadParams {
  organizationId: string;
  entityType: 'bill' | 'measurement' | 'work_log';
  entityId: string;
  dataUrl: string;
  userId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BUCKETS = {
  SIGNATURES: 'signatures',
  PROJECT_FILES: 'project-files',
  CHAT_ATTACHMENTS: 'chat-attachments',
  THUMBNAILS: 'thumbnails',
} as const;

const MAX_SIGNATURE_SIZE = 1024 * 1024; // 1 MB
const ALLOWED_SIGNATURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// ============================================================================
// SERVICE
// ============================================================================

export class StorageService {
  private supabase = getSupabaseAdmin();

  /**
   * Upload a signature from a data URL
   *
   * Path format: {org_id}/{entity_type}/{entity_id}/{timestamp}.png
   */
  async uploadSignature(params: SignatureUploadParams): Promise<UploadResult> {
    const { organizationId, entityType, entityId, dataUrl, userId } = params;

    // Validate data URL format
    if (!dataUrl.startsWith('data:image/')) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid signature format. Must be a base64 image data URL.',
        400
      );
    }

    // Extract mime type and base64 data
    const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid data URL format', 400);
    }

    const [, mimeType, base64Data] = matches;

    // Validate mime type
    if (!ALLOWED_SIGNATURE_TYPES.includes(mimeType)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid image type. Allowed: ${ALLOWED_SIGNATURE_TYPES.join(', ')}`,
        400
      );
    }

    // Convert base64 to bytes (web-standard, works in Deno + Node.js)
    const buffer = base64ToUint8Array(base64Data);

    // Validate size
    if (buffer.length > MAX_SIGNATURE_SIZE) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Signature too large. Maximum size: ${MAX_SIGNATURE_SIZE / 1024}KB`,
        400
      );
    }

    // Generate file path
    const extension = mimeType.split('/')[1];
    const timestamp = Date.now();
    const path = `${organizationId}/${entityType}/${entityId}/${timestamp}.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await this.supabase.storage
      .from(BUCKETS.SIGNATURES)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      logger.error('Failed to upload signature', {
        error: error.message,
        path,
        userId,
        entityType,
        entityId,
      });
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to upload signature', 500);
    }

    // Get public URL
    const { data: urlData } = this.supabase.storage
      .from(BUCKETS.SIGNATURES)
      .getPublicUrl(data.path);

    logger.info('Signature uploaded', {
      path: data.path,
      userId,
      entityType,
      entityId,
    });

    return {
      path: data.path,
      publicUrl: urlData.publicUrl,
    };
  }

  /**
   * Delete a signature file
   */
  async deleteSignature(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKETS.SIGNATURES).remove([path]);

    if (error) {
      logger.error('Failed to delete signature', { error: error.message, path });
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to delete signature', 500);
    }

    logger.info('Signature deleted', { path });
  }

  /**
   * Get a signed URL for a private file (expires in 1 hour)
   */
  async getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      logger.error('Failed to create signed URL', { error: error.message, bucket, path });
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to create signed URL', 500);
    }

    return data.signedUrl;
  }
}

// Singleton instance
let storageService: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageService) {
    storageService = new StorageService();
  }
  return storageService;
}
