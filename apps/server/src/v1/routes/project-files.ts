/**
 * Project Files Routes
 *
 * API endpoints for project document/file management:
 * - List files
 * - Upload files
 * - Delete files
 * - Move files between folders
 * - Download files
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import { logger } from '../../lib/logger.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { getSupabaseAdmin } from '../../lib/supabase.ts';
import { db, projectFiles } from '@revbrain/database';
import { eq } from 'drizzle-orm';

const projectFilesRouter = new OpenAPIHono<AppEnv>();

// ============================================================================
// CONSTANTS
// ============================================================================

const BUCKET_NAME = 'project-files';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const updateFileSchema = z.object({
  folderPath: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /v1/projects/:projectId/files
 * Get all files for a project
 */
projectFilesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Project Files'],
    summary: 'List Files',
    description: 'Returns all files for a project.',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                files: z.array(z.any()),
                total: z.number(),
              }),
            }),
          },
        },
        description: 'Files retrieved successfully',
      },
    },
  }),
  async (c) => {
    const projectIdParam = c.req.param('projectId');
    const { user, repos } = c.var;

    const projectIdResult = z.string().uuid().safeParse(projectIdParam);
    if (!projectIdResult.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid project ID', 400);
    }
    const projectId = projectIdResult.data;

    // Verify project access
    const project = await repos.projects.findById(projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Get files
    const files = await db.query.projectFiles.findMany({
      where: (pf, { eq: eqOp }) => eqOp(pf.projectId, projectId),
      orderBy: (pf, { desc: descOp }) => [descOp(pf.createdAt)],
    });

    return c.json({
      success: true,
      data: {
        files,
        total: files.length,
      },
    });
  }
);

/**
 * POST /v1/projects/:projectId/files
 * Upload a file to a project
 */
projectFilesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Project Files'],
    summary: 'Upload File',
    description: 'Uploads a file to a project. Max file size is 50MB.',
    responses: {
      201: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'File uploaded successfully',
      },
    },
  }),
  async (c) => {
    const projectIdParam = c.req.param('projectId');
    const { user, repos } = c.var;
    const supabase = getSupabaseAdmin();

    logger.info('[FileUpload] Starting upload', { projectIdParam, userId: user?.id });

    const projectIdResult = z.string().uuid().safeParse(projectIdParam);
    if (!projectIdResult.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid project ID', 400);
    }
    const projectId = projectIdResult.data;

    // Verify project access
    logger.info('[FileUpload] Looking up project', { projectId });
    const project = await repos.projects.findById(projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }
    logger.info('[FileUpload] Project found', { projectId, orgId: project.organizationId });

    // Parse form data
    let formData;
    try {
      formData = await c.req.formData();
      logger.info('[FileUpload] FormData parsed successfully');
    } catch (formError) {
      logger.error('[FileUpload] FormData parsing failed', { error: formError });
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Failed to parse form data', 400);
    }

    const file = formData.get('file') as File | null;
    const folderPath = (formData.get('folderPath') as string) || '/';
    const metadataStr = formData.get('metadata') as string | null;
    let metadata: Record<string, unknown> = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        // Invalid JSON, ignore
      }
    }

    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No file provided', 400);
    }

    logger.info('[FileUpload] File received', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      folderPath,
    });

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        400
      );
    }

    // Get file extension
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const timestamp = Date.now();
    // Sanitize filename for storage - replace non-ASCII chars, keep extension
    const safeFileName = `${timestamp}_${crypto.randomUUID().slice(0, 8)}.${extension}`;
    const storagePath = `${user.organizationId}/${projectId}${folderPath}/${safeFileName}`;

    logger.info('[FileUpload] Uploading to storage', { storagePath, bucket: BUCKET_NAME });

    // Upload to Supabase Storage
    let arrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
      logger.info('[FileUpload] ArrayBuffer created', { size: arrayBuffer.byteLength });
    } catch (bufferError) {
      logger.error('[FileUpload] ArrayBuffer creation failed', { error: bufferError });
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to read file', 500);
    }

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      logger.error('[FileUpload] Storage upload failed', {
        error: uploadError,
        errorMessage: uploadError.message,
        storagePath,
      });
      throw new AppError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        `Failed to upload file: ${uploadError.message}`,
        500
      );
    }

    logger.info('[FileUpload] Storage upload successful', { path: uploadData.path });

    // Create database record
    let fileRecord;
    try {
      const [record] = await db
        .insert(projectFiles)
        .values({
          organizationId: user.organizationId,
          projectId,
          fileName: file.name,
          fileType: extension,
          storagePath: uploadData.path,
          fileSizeBytes: file.size,
          mimeType: file.type,
          folderPath,
          metadata,
          uploadedBy: user.id,
        })
        .returning();
      fileRecord = record;
      logger.info('[FileUpload] Database record created', { fileId: fileRecord.id });
    } catch (dbError) {
      logger.error('[FileUpload] Database insert failed', { error: dbError });
      // Clean up uploaded file
      await supabase.storage.from(BUCKET_NAME).remove([uploadData.path]);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to save file record', 500);
    }

    logger.info('File uploaded', {
      fileId: fileRecord.id,
      projectId,
      userId: user.id,
      fileName: file.name,
    });

    return c.json(
      {
        success: true,
        data: fileRecord,
      },
      201
    );
  }
);

/**
 * GET /v1/projects/:projectId/files/:fileId/download
 * Get a signed download URL for a file
 */
projectFilesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{fileId}/download',
    tags: ['Project Files'],
    summary: 'Get Download URL',
    description: 'Returns a signed download URL for a file (valid for 1 hour).',
    request: {
      params: z.object({
        fileId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                url: z.string(),
                expiresIn: z.number(),
              }),
            }),
          },
        },
        description: 'Download URL generated successfully',
      },
    },
  }),
  async (c) => {
    const projectIdParam = c.req.param('projectId');
    const { fileId } = c.req.valid('param');
    const { user } = c.var;
    const supabase = getSupabaseAdmin();

    const projectIdResult = z.string().uuid().safeParse(projectIdParam);
    if (!projectIdResult.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid project ID', 400);
    }
    const projectId = projectIdResult.data;

    // Get file record
    const file = await db.query.projectFiles.findFirst({
      where: (pf, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(pf.id, fileId), eqOp(pf.projectId, projectId)),
    });

    if (!file) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'File not found', 404);
    }

    // Verify organization access
    if (file.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Create signed URL (expires in 1 hour)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(file.storagePath, 3600);

    if (error) {
      logger.error('Failed to create signed URL', { error, fileId });
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to create download URL', 500);
    }

    return c.json({
      success: true,
      data: {
        url: data.signedUrl,
        expiresIn: 3600,
      },
    });
  }
);

/**
 * PUT /v1/projects/:projectId/files/:fileId
 * Update a file (move to different folder, update metadata)
 */
projectFilesRouter.openapi(
  createRoute({
    method: 'put',
    path: '/{fileId}',
    tags: ['Project Files'],
    summary: 'Update File',
    description: 'Updates file metadata or moves it to a different folder.',
    request: {
      params: z.object({
        fileId: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateFileSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
            }),
          },
        },
        description: 'File updated successfully',
      },
    },
  }),
  async (c) => {
    const projectIdParam = c.req.param('projectId');
    const { fileId } = c.req.valid('param');
    const input = c.req.valid('json');
    const { user } = c.var;

    const projectIdResult = z.string().uuid().safeParse(projectIdParam);
    if (!projectIdResult.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid project ID', 400);
    }
    const projectId = projectIdResult.data;

    // Get existing file
    const existing = await db.query.projectFiles.findFirst({
      where: (pf, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(pf.id, fileId), eqOp(pf.projectId, projectId)),
    });

    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'File not found', 404);
    }

    if (existing.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Update file record
    const [updated] = await db
      .update(projectFiles)
      .set(input)
      .where(eq(projectFiles.id, fileId))
      .returning();

    logger.info('File updated', { fileId, projectId, userId: user.id });

    return c.json({
      success: true,
      data: updated,
    });
  }
);

/**
 * DELETE /v1/projects/:projectId/files/:fileId
 * Delete a file
 */
projectFilesRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{fileId}',
    tags: ['Project Files'],
    summary: 'Delete File',
    description: 'Deletes a file from the project.',
    request: {
      params: z.object({
        fileId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
        description: 'File deleted successfully',
      },
    },
  }),
  async (c) => {
    const projectIdParam = c.req.param('projectId');
    const { fileId } = c.req.valid('param');
    const { user } = c.var;
    const supabase = getSupabaseAdmin();

    const projectIdResult = z.string().uuid().safeParse(projectIdParam);
    if (!projectIdResult.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid project ID', 400);
    }
    const projectId = projectIdResult.data;

    // Get file record
    const file = await db.query.projectFiles.findFirst({
      where: (pf, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(pf.id, fileId), eqOp(pf.projectId, projectId)),
    });

    if (!file) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'File not found', 404);
    }

    if (file.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([file.storagePath]);

    if (storageError) {
      logger.warn('Failed to delete file from storage', { error: storageError, fileId });
      // Continue with database deletion anyway
    }

    // Delete from database
    await db.delete(projectFiles).where(eq(projectFiles.id, fileId));

    logger.info('File deleted', { fileId, projectId, userId: user.id });

    return c.json({
      success: true,
      message: 'File deleted',
    });
  }
);

export { projectFilesRouter };
