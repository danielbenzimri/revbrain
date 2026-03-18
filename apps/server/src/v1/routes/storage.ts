/**
 * Storage Routes
 *
 * API endpoints for file uploads to Supabase Storage.
 * Currently supports signature uploads.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import { getStorageService } from '../../services/storage.service.ts';
import { logger } from '../../lib/logger.ts';

const storageRouter = new OpenAPIHono<AppEnv>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const uploadSignatureSchema = z.object({
  entityType: z.enum(['bill', 'measurement', 'work_log']),
  entityId: z.string().uuid(),
  dataUrl: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('data:image/'), 'Must be a base64 image data URL'),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /v1/storage/signatures
 * Upload a signature image
 */
storageRouter.openapi(
  createRoute({
    method: 'post',
    path: '/signatures',
    tags: ['Storage'],
    summary: 'Upload Signature',
    description: 'Uploads a signature image to storage.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: uploadSignatureSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                path: z.string(),
                url: z.string(),
              }),
            }),
          },
        },
        description: 'Signature uploaded successfully',
      },
    },
  }),
  async (c) => {
    const { user } = c.var;
    const input = c.req.valid('json');

    const storage = getStorageService();
    const result = await storage.uploadSignature({
      organizationId: user.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      dataUrl: input.dataUrl,
      userId: user.id,
    });

    logger.info('Signature uploaded', {
      entityType: input.entityType,
      entityId: input.entityId,
      userId: user.id,
    });

    return c.json(
      {
        success: true,
        data: {
          path: result.path,
          url: result.publicUrl,
        },
      },
      201
    );
  }
);

export { storageRouter };
