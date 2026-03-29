/**
 * Users Routes
 *
 * Handles user profile management: get profile, update profile,
 * change password, and self-delete account.
 * Requires authentication.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth.ts';
import { authLimiter } from '../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../lib/middleware-types.ts';
import type { AppEnv } from '../../types/index.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { RequestContext } from '../../services/types.ts';
import { getClientIpOrNull } from '../../lib/request-ip.ts';
import { getSupabaseAdmin } from '../../lib/supabase.ts';

const usersRouter = new OpenAPIHono<AppEnv>();

// User profile response schema
const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  mobileNumber: z.string().nullable(),
  jobTitle: z.string().nullable(),
  address: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  age: z.number().nullable(),
  role: z.string(),
});

// ============================================================================
// GET CURRENT USER
// ============================================================================

usersRouter.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['Users'],
    summary: 'Get Current User',
    description: "Returns the authenticated user's profile.",
    middleware: routeMiddleware(authMiddleware),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: userProfileSchema,
            }),
          },
        },
        description: 'User profile retrieved successfully',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        mobileNumber: user.mobileNumber,
        jobTitle: user.jobTitle,
        address: user.address,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        age: user.age,
        role: user.role,
      },
    });
  }
);

// ============================================================================
// UPDATE PROFILE
// ============================================================================

usersRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/me',
    tags: ['Users'],
    summary: 'Update Profile',
    description: "Updates the authenticated user's profile.",
    middleware: routeMiddleware(authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              fullName: z.string().optional(),
              phoneNumber: z.string().nullable().optional(),
              mobileNumber: z.string().nullable().optional(),
              jobTitle: z.string().nullable().optional(),
              address: z.string().nullable().optional(),
              bio: z.string().nullable().optional(),
              avatarUrl: z.string().nullable().optional(),
              age: z.number().nullable().optional(),
              preferences: z.any().optional(),
            }),
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
              data: userProfileSchema.extend({
                preferences: z.any().optional(),
              }),
            }),
          },
        },
        description: 'Profile updated successfully',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const body = c.req.valid('json');

    const allowedFields = [
      'fullName',
      'phoneNumber',
      'mobileNumber',
      'jobTitle',
      'address',
      'bio',
      'avatarUrl',
      'age',
      'preferences',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No valid fields to update', 400);
    }

    const ctx: RequestContext = {
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    const updated = await c.var.services.users.updateProfile(user.id, updates, ctx);

    return c.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phoneNumber: updated.phoneNumber,
        mobileNumber: updated.mobileNumber,
        jobTitle: updated.jobTitle,
        address: updated.address,
        bio: updated.bio,
        avatarUrl: updated.avatarUrl,
        age: updated.age,
        role: updated.role,
        preferences: updated.preferences,
      },
    });
  }
);

// ============================================================================
// UPLOAD AVATAR
// ============================================================================

usersRouter.openapi(
  createRoute({
    method: 'post',
    path: '/me/avatar',
    tags: ['Users'],
    summary: 'Upload Avatar',
    description: 'Uploads an avatar image. Max 2MB. Replaces existing avatar.',
    middleware: routeMiddleware(authMiddleware),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({ avatarUrl: z.string() }),
            }),
          },
        },
        description: 'Avatar uploaded successfully',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No file provided', 400);
    }

    const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_AVATAR_SIZE) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Avatar too large. Maximum 2MB.', 400);
    }

    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid file type. Use PNG, JPEG, or WebP.',
        400
      );
    }

    const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const storagePath = `${user.organizationId}/${user.id}.${extension}`;

    const supabase = getSupabaseAdmin();
    const arrayBuffer = await file.arrayBuffer();

    // Upload (upsert to replace existing avatar)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      throw new AppError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        `Upload failed: ${uploadError.message}`,
        500
      );
    }

    // Get signed URL (long-lived for avatar display)
    const { data: signedData } = await supabase.storage
      .from('avatars')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

    const avatarUrl = signedData?.signedUrl || '';

    // Update user record with avatar URL
    const ctx: RequestContext = {
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    const updated = await c.var.services.users.updateProfile(user.id, { avatarUrl }, ctx);

    return c.json({
      success: true,
      data: { avatarUrl: updated?.avatarUrl || avatarUrl },
    });
  }
);

// ============================================================================
// CHANGE PASSWORD
// ============================================================================

usersRouter.openapi(
  createRoute({
    method: 'post',
    path: '/me/change-password',
    tags: ['Users'],
    summary: 'Change Password',
    description: "Changes the authenticated user's password.",
    middleware: routeMiddleware(authLimiter, authMiddleware),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              newPassword: z.string().min(8),
            }),
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
              message: z.string(),
            }),
          },
        },
        description: 'Password changed successfully',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const { newPassword } = c.req.valid('json');

    const ctx: RequestContext = {
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    await c.var.services.users.changePassword(user.id, user.supabaseUserId, newPassword, ctx);

    return c.json({
      success: true,
      message: 'Password updated successfully',
    });
  }
);

// ============================================================================
// DELETE ACCOUNT
// ============================================================================

usersRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/me',
    tags: ['Users'],
    summary: 'Delete Account',
    description: "Deletes the authenticated user's account (self-deletion).",
    middleware: routeMiddleware(authLimiter, authMiddleware),
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
        description: 'Account deleted successfully',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const ctx: RequestContext = {
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIpOrNull(c),
      userAgent: c.req.header('user-agent') || null,
    };

    await c.var.services.users.deleteUser(user.id, ctx, { isSelfDeletion: true });

    return c.json({
      success: true,
      message: 'Account deleted successfully',
    });
  }
);

export { usersRouter };
