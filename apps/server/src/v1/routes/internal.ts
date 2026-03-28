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
import { logger } from '../../lib/logger.ts';
import { getEnv } from '../../lib/env.ts';
import { SalesforceOAuthService } from '../../services/salesforce-oauth.service.ts';

export const internalRouter = new OpenAPIHono<AppEnv>();

/**
 * Validate the internal API secret from Authorization header.
 */
function validateInternalAuth(authHeader: string | undefined): boolean {
  const expectedSecret = getEnv('INTERNAL_API_SECRET');
  if (!expectedSecret) return false;
  return authHeader === `Bearer ${expectedSecret}`;
}

/**
 * POST /internal/salesforce/refresh
 *
 * Called by the extraction worker to refresh Salesforce tokens.
 * Validates that the run references the given connection.
 * Performs the refresh and writes new encrypted tokens to DB.
 * Returns the new access token to the worker.
 */
internalRouter.post('/salesforce/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!validateInternalAuth(authHeader)) {
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

  const repos = c.var.repos;

  // 1. Validate run exists and references this connection
  const run = await repos.assessmentRuns.findRunById(runId);
  if (!run || run.connectionId !== connectionId) {
    logger.warn('internal_refresh_invalid_run');
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Run not found or connection mismatch' },
      },
      404
    );
  }

  // 2. Get the connection
  const connection = await repos.salesforceConnections.findById(connectionId);
  if (!connection) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Connection not found' } },
      404
    );
  }

  // 3. Get secrets (refresh token)
  const secrets = await repos.salesforceConnectionSecrets.findByConnectionId(connectionId);
  if (!secrets?.refreshToken) {
    return c.json(
      {
        success: false,
        error: { code: 'PRECONDITION_FAILED', message: 'No refresh token available' },
      },
      412
    );
  }

  // 4. Perform the refresh via OAuth service
  try {
    const oauthService = new SalesforceOAuthService({
      consumerKey: getEnv('SALESFORCE_CONSUMER_KEY') || '',
      consumerSecret: getEnv('SALESFORCE_CONSUMER_SECRET') || '',
      callbackUrl: getEnv('SALESFORCE_CALLBACK_URL') || '',
      stateSigningSecret: getEnv('SALESFORCE_STATE_SIGNING_SECRET') || '',
    });

    // Determine login URL based on instance type
    const oauthBaseUrl =
      connection.instanceType === 'sandbox'
        ? 'https://test.salesforce.com'
        : 'https://login.salesforce.com';

    const result = await oauthService.refreshAccessToken(oauthBaseUrl, secrets.refreshToken);

    // 5. Update stored tokens (optimistic lock via tokenVersion)
    await repos.salesforceConnectionSecrets.updateTokens(
      connectionId,
      result.accessToken,
      secrets.tokenVersion
    );

    // 6. Update connection metadata with last used timestamp
    await repos.salesforceConnections.updateMetadata(connectionId, {
      ...(connection.connectionMetadata ?? {}),
      lastTokenRefresh: new Date().toISOString(),
    });

    logger.info('internal_token_refreshed');

    return c.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        instanceUrl: connection.salesforceInstanceUrl,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('internal_refresh_failed');

    return c.json(
      {
        success: false,
        error: { code: 'REFRESH_FAILED', message: `Token refresh failed: ${errorMsg}` },
      },
      502
    );
  }
});

/**
 * POST /internal/assessment/heartbeat
 *
 * Called by the extraction worker to report progress.
 * Updates the run's progress JSONB and lease heartbeat.
 */
internalRouter.post('/assessment/heartbeat', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!validateInternalAuth(authHeader)) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid internal API secret' } },
      401
    );
  }

  const body = await c.req.json<{
    runId: string;
    progress: Record<string, unknown>;
  }>();

  if (!body.runId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'runId required' } },
      400
    );
  }

  const repos = c.var.repos;
  const run = await repos.assessmentRuns.findRunById(body.runId);
  if (!run) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  // Note: In production this would update progress JSONB + lease heartbeat directly.
  // For now, the worker updates via postgres.js directly.
  return c.json({ success: true });
});
