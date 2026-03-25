/**
 * Internal API routes — called by the extraction worker, not by end users.
 *
 * Protected by INTERNAL_API_SECRET (shared secret in env).
 * Not exposed to public internet.
 *
 * See: Implementation Plan Task 2.7
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { type AppEnv } from '../../types/index.ts';

export const internalRouter = new OpenAPIHono<AppEnv>();

/**
 * POST /internal/salesforce/refresh
 *
 * Called by the extraction worker to refresh Salesforce tokens.
 * Validates that the run references the given connection.
 * Performs the refresh and writes new encrypted tokens to DB.
 * Returns the new access token to the worker.
 */
internalRouter.post('/salesforce/refresh', async (c) => {
  // Validate internal API secret
  const authHeader = c.req.header('Authorization');
  const expectedSecret = process.env.INTERNAL_API_SECRET;

  if (!expectedSecret) {
    return c.json(
      {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'INTERNAL_API_SECRET not configured' },
      },
      500
    );
  }

  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid internal API secret' } },
      401
    );
  }

  const body = await c.req.json<{ connectionId: string; runId: string }>();
  const { connectionId, runId } = body;

  if (!connectionId || !runId) {
    return c.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'connectionId and runId required' },
      },
      400
    );
  }

  // TODO: Validate run references this connection
  // TODO: Perform token refresh via salesforce-oauth.service.ts
  // TODO: Return { accessToken, instanceUrl }

  // Placeholder — will be fully implemented when services are wired
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Token refresh delegation not yet wired to OAuth service',
      },
    },
    501
  );
});
