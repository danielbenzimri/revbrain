/**
 * Body Limit Middleware
 *
 * Protects against DoS attacks by limiting request body sizes.
 * Different limits for different endpoint types:
 * - JSON API: 100KB (generous for JSON payloads)
 * - Webhooks: 64KB (Stripe webhooks are typically small)
 * - File uploads: 10MB (configurable per route)
 */
import { bodyLimit } from 'hono/body-limit';
import { AppError, ErrorCodes } from '@revbrain/contract';

// Size constants (in bytes)
const KB = 1024;
const MB = 1024 * KB;

// Default limits
export const BODY_LIMITS = {
  JSON_API: 100 * KB, // 100KB - more than enough for JSON APIs
  WEBHOOK: 64 * KB, // 64KB - Stripe webhooks are small
  FILE_UPLOAD: 50 * MB, // 50MB - matches storage bucket limit
} as const;

/**
 * Custom error handler that throws AppError for consistent error responses
 */
function onError(): never {
  throw new AppError(ErrorCodes.PAYLOAD_TOO_LARGE, 'Request body too large', 413);
}

/**
 * Standard body limit for JSON API endpoints (100KB)
 */
export const apiBodyLimit = bodyLimit({
  maxSize: BODY_LIMITS.JSON_API,
  onError,
});

/**
 * Body limit for webhook endpoints (64KB)
 */
export const webhookBodyLimit = bodyLimit({
  maxSize: BODY_LIMITS.WEBHOOK,
  onError,
});

/**
 * Body limit for file upload endpoints (10MB)
 */
export const fileUploadBodyLimit = bodyLimit({
  maxSize: BODY_LIMITS.FILE_UPLOAD,
  onError,
});

/**
 * Create a custom body limit middleware with a specific size
 * @param maxSizeBytes Maximum body size in bytes
 */
export function createBodyLimit(maxSizeBytes: number) {
  return bodyLimit({
    maxSize: maxSizeBytes,
    onError,
  });
}
