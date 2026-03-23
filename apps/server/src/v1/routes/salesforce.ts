/**
 * Salesforce Routes
 *
 * API endpoints for Salesforce OAuth connection management:
 * - Initiate OAuth flow (connect)
 * - Handle OAuth callback
 * - List connections
 * - Disconnect
 * - Test connection health
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import crypto from 'node:crypto';
import type { AppEnv } from '../../types/index.ts';
import { logger } from '../../lib/logger.ts';
import { getEnv } from '../../lib/env.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { authMiddleware } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/rbac.ts';
import {
  salesforceConnectLimiter,
  salesforceCallbackLimiter,
} from '../../middleware/rate-limit.ts';
import { SalesforceOAuthService } from '../../services/salesforce-oauth.service.ts';
import { SalesforceAuditService } from '../../services/salesforce-audit.service.ts';

const salesforceRouter = new OpenAPIHono<AppEnv>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const connectBodySchema = z.object({
  instanceType: z.enum(['production', 'sandbox']),
  connectionRole: z.enum(['source', 'target']),
  loginUrl: z.string().url().optional(),
});

const disconnectBodySchema = z.object({
  connectionRole: z.enum(['source', 'target']),
});

const testBodySchema = z.object({
  connectionRole: z.enum(['source', 'target']),
});

const connectionStatusResponseSchema = z.object({
  id: z.string().uuid(),
  connectionRole: z.string(),
  salesforceOrgId: z.string(),
  salesforceInstanceUrl: z.string(),
  salesforceUsername: z.string().nullable(),
  instanceType: z.string(),
  apiVersion: z.string().nullable(),
  status: z.string(),
  connectionMetadata: z.record(z.string(), z.unknown()).nullable(),
  lastUsedAt: z.string().nullable(),
  lastSuccessfulApiCallAt: z.string().nullable(),
  lastError: z.string().nullable(),
  connectedBy: z.string().nullable(),
  createdAt: z.string(),
});

// ============================================================================
// HELPERS
// ============================================================================

function createOAuthService(): SalesforceOAuthService {
  return new SalesforceOAuthService({
    consumerKey: getEnv('SALESFORCE_CONSUMER_KEY') || '',
    consumerSecret: getEnv('SALESFORCE_CONSUMER_SECRET') || '',
    callbackUrl: getEnv('SALESFORCE_CALLBACK_URL') || '',
    stateSigningSecret: getEnv('SALESFORCE_STATE_SIGNING_SECRET') || '',
  });
}

function getAppOrigin(): string {
  return getEnv('APP_URL') || 'http://localhost:5173';
}

function renderErrorHtml(message: string, cspNonce: string, appOrigin: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h2>Connection Error</h2><p>${message}</p>
<p><a href="javascript:window.close()">Close this window</a></p>
<script nonce="${cspNonce}">
if (window.opener) {
  window.opener.postMessage({ type: 'sf_error', error: '${message.replace(/'/g, "\\'")}' }, '${appOrigin}');
}
</script></body></html>`;
}

function toConnectionStatusResponse(
  conn: {
    id: string;
    connectionRole: string;
    salesforceOrgId: string;
    salesforceInstanceUrl: string;
    salesforceUsername: string | null;
    instanceType: string;
    apiVersion: string | null;
    status: string;
    connectionMetadata: Record<string, unknown> | null;
    lastUsedAt: Date | null;
    lastSuccessfulApiCallAt: Date | null;
    lastError: string | null;
    connectedBy: string | null;
    createdAt: Date;
  },
  statusOverride?: string
) {
  return {
    id: conn.id,
    connectionRole: conn.connectionRole,
    salesforceOrgId: conn.salesforceOrgId,
    salesforceInstanceUrl: conn.salesforceInstanceUrl,
    salesforceUsername: conn.salesforceUsername,
    instanceType: conn.instanceType,
    apiVersion: conn.apiVersion,
    status: statusOverride ?? conn.status,
    connectionMetadata: conn.connectionMetadata,
    lastUsedAt: conn.lastUsedAt?.toISOString() ?? null,
    lastSuccessfulApiCallAt: conn.lastSuccessfulApiCallAt?.toISOString() ?? null,
    lastError: conn.lastError,
    connectedBy: conn.connectedBy,
    createdAt: conn.createdAt.toISOString(),
  };
}

// ============================================================================
// ROUTE 1: POST /:projectId/salesforce/connect
// ============================================================================

/**
 * POST /v1/projects/:projectId/salesforce/connect
 * Initiate Salesforce OAuth flow for a project.
 */
salesforceRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{projectId}/salesforce/connect',
    tags: ['Salesforce'],
    summary: 'Initiate Salesforce Connection',
    description: 'Starts the OAuth 2.0 + PKCE flow to connect a Salesforce org.',
    middleware: [
      authMiddleware,
      requireRole('org_owner', 'admin'),
      salesforceConnectLimiter,
    ] as const,
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: connectBodySchema,
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
              data: z.object({
                redirectUrl: z.string(),
              }),
            }),
          },
        },
        description: 'OAuth redirect URL generated',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { instanceType, connectionRole, loginUrl } = c.req.valid('json');
    const { user, repos } = c.var;

    // Verify project exists and belongs to user's org
    const project = await repos.projects.findById(projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Check for existing active connection for this role
    const existingConnection = await repos.salesforceConnections.findByProjectAndRole(
      projectId,
      connectionRole
    );
    if (existingConnection && existingConnection.status === 'active') {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        `Already connected as ${connectionRole}. Disconnect first.`,
        409
      );
    }

    // Check for live pending flow (connection in progress)
    const pendingFlow = await repos.oauthPendingFlows.findLiveByProjectAndRole(
      projectId,
      connectionRole
    );
    if (pendingFlow) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Connection flow already in progress. Please wait or try again.',
        409
      );
    }

    // Create OAuth service and generate flow
    const oauthService = createOAuthService();

    // Validate and determine OAuth base URL
    let oauthBaseUrl: string;
    if (loginUrl) {
      oauthBaseUrl = oauthService.validateLoginUrl(loginUrl);
    } else {
      oauthBaseUrl = oauthService.determineOAuthBaseUrl(instanceType);
    }

    // Generate PKCE pair and state
    const pkce = oauthService.generatePKCE();
    const nonce = crypto.randomUUID();
    const state = oauthService.signState(nonce);

    // Store pending flow
    await repos.oauthPendingFlows.upsertForProject({
      nonce,
      projectId,
      organizationId: user.organizationId,
      userId: user.id,
      connectionRole,
      codeVerifier: pkce.codeVerifier,
      oauthBaseUrl,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    // Generate authorization URL
    const redirectUrl = oauthService.generateAuthorizationUrl(
      oauthBaseUrl,
      pkce.codeChallenge,
      state
    );

    logger.info('Salesforce OAuth flow initiated', {
      projectId,
      connectionRole,
      instanceType,
      userId: user.id,
    });

    return c.json({
      success: true,
      data: { redirectUrl },
    });
  }
);

// ============================================================================
// ROUTE 2: GET /oauth/callback
// ============================================================================

/**
 * GET /v1/salesforce/oauth/callback
 * Handles Salesforce OAuth redirect. No auth middleware — called by browser redirect.
 */
salesforceRouter.openapi(
  createRoute({
    method: 'get',
    path: '/oauth/callback',
    tags: ['Salesforce'],
    summary: 'Salesforce OAuth Callback',
    description: 'Handles the OAuth 2.0 callback from Salesforce.',
    middleware: [salesforceCallbackLimiter] as const,
    request: {
      query: z.object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
        description: 'HTML response with postMessage to parent window',
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query');
    const code = query.code;
    const state = query.state;
    const oauthError = query.error;
    const errorDescription = query.error_description;
    const cspNonce = crypto.randomUUID();
    const appOrigin = getAppOrigin();

    // Handle Salesforce-side errors (user denied, etc.)
    if (oauthError) {
      const message = errorDescription || oauthError;
      return c.html(renderErrorHtml(message, cspNonce, appOrigin), 200, {
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${cspNonce}'`,
      });
    }

    // Validate required params
    if (!code || !state) {
      return c.html(
        renderErrorHtml('Missing authorization code or state parameter.', cspNonce, appOrigin),
        200,
        {
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${cspNonce}'`,
        }
      );
    }

    // Verify state signature
    const oauthService = createOAuthService();
    let nonce: string;
    try {
      const statePayload = oauthService.verifyState(state);
      nonce = statePayload.nonce;
    } catch (error) {
      logger.warn('Salesforce OAuth: invalid state', {}, error as Error);
      return c.html(
        renderErrorHtml('Invalid or expired authorization state.', cspNonce, appOrigin),
        200,
        {
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${cspNonce}'`,
        }
      );
    }

    // Find pending flow by nonce
    const { repos } = c.var;
    const pendingFlow = await repos.oauthPendingFlows.findByNonce(nonce);
    if (!pendingFlow) {
      return c.html(
        renderErrorHtml(
          'Session expired. Please close this window and try connecting again.',
          cspNonce,
          appOrigin
        ),
        200,
        {
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${cspNonce}'`,
        }
      );
    }

    const { projectId, organizationId, userId, connectionRole, codeVerifier, oauthBaseUrl } =
      pendingFlow;

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await oauthService.exchangeCodeForTokens(oauthBaseUrl, code, codeVerifier);
    } catch (error) {
      logger.error(
        'Salesforce OAuth: token exchange failed',
        { projectId, connectionRole },
        error as Error
      );
      return c.html(
        renderErrorHtml('Failed to complete authorization. Please try again.', cspNonce, appOrigin),
        200,
        {
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${cspNonce}'`,
        }
      );
    }

    // Parse Salesforce org and user IDs from the id URL
    const sfIds = oauthService.parseOrgAndUserFromIdUrl(tokens.idUrl);

    // Create connection record
    const connection = await repos.salesforceConnections.create({
      projectId,
      organizationId,
      connectionRole: connectionRole as 'source' | 'target',
      salesforceOrgId: sfIds.orgId,
      salesforceInstanceUrl: tokens.instanceUrl,
      oauthBaseUrl,
      salesforceUserId: sfIds.userId,
      instanceType: oauthBaseUrl.includes('test.salesforce.com') ? 'sandbox' : 'production',
      connectedBy: userId,
    });

    // Store encrypted tokens
    await repos.salesforceConnectionSecrets.create(
      connection.id,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.scope
    );

    // Delete pending flow (it's been consumed)
    await repos.oauthPendingFlows.deleteByNonce(nonce);

    // Run post-connection audit (non-blocking — store partial results)
    try {
      const auditService = new SalesforceAuditService();
      const auditResult = await auditService.runPostConnectionAudit(
        tokens.accessToken,
        tokens.instanceUrl,
        connectionRole as 'source' | 'target'
      );

      await repos.salesforceConnections.updateMetadata(
        connection.id,
        auditResult as unknown as Record<string, unknown>
      );

      if (auditResult.apiVersion) {
        await repos.salesforceConnections.updateStatus(connection.id, 'active');
      }

      logger.info('Salesforce post-connection audit completed', {
        connectionId: connection.id,
        cpqInstalled: auditResult.cpqInstalled,
        rcaAvailable: auditResult.rcaAvailable,
        missingPermissions: auditResult.missingPermissions,
      });
    } catch (auditError) {
      logger.warn(
        'Salesforce post-connection audit failed (non-fatal)',
        { connectionId: connection.id },
        auditError as Error
      );
    }

    // Log connection event
    try {
      await repos.salesforceConnectionLogs.create({
        connectionId: connection.id,
        event: 'connected',
        details: {
          salesforceOrgId: sfIds.orgId,
          salesforceUserId: sfIds.userId,
          instanceUrl: tokens.instanceUrl,
          connectionRole,
        },
        performedBy: userId,
      });
    } catch (logError) {
      logger.warn(
        'Failed to log Salesforce connection event',
        { connectionId: connection.id },
        logError as Error
      );
    }

    // Return HTML that notifies the parent window and closes
    return c.html(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<p>Connected successfully. This window will close.</p>
<script nonce="${cspNonce}">
const APP_ORIGIN = '${appOrigin}';
if (window.opener) {
  window.opener.postMessage({ type: 'sf_connected', role: '${connectionRole}' }, APP_ORIGIN);
  window.close();
} else {
  window.location.href = '/project/${projectId}?sf_connected=true&role=${connectionRole}';
}
</script></body></html>`,
      200,
      {
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${cspNonce}'`,
      }
    );
  }
);

// ============================================================================
// ROUTE 3: GET /:projectId/salesforce/connections
// ============================================================================

/**
 * GET /v1/projects/:projectId/salesforce/connections
 * List Salesforce connections for a project.
 */
salesforceRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{projectId}/salesforce/connections',
    tags: ['Salesforce'],
    summary: 'List Salesforce Connections',
    description: 'Returns source and target connection status for a project.',
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                source: connectionStatusResponseSchema.nullable(),
                target: connectionStatusResponseSchema.nullable(),
              }),
            }),
          },
        },
        description: 'Connections retrieved successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { user, repos } = c.var;

    // Verify project exists and belongs to user's org
    const project = await repos.projects.findById(projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    const connections = await repos.salesforceConnections.findByProject(projectId);

    let sourceResponse = null;
    let targetResponse = null;

    for (const conn of connections) {
      // Check if there's a live pending flow for this role (status = 'connecting')
      let statusOverride: string | undefined;
      if (conn.status !== 'active' && conn.status !== 'disconnected') {
        const pendingFlow = await repos.oauthPendingFlows.findLiveByProjectAndRole(
          projectId,
          conn.connectionRole
        );
        if (pendingFlow) {
          statusOverride = 'connecting';
        }
      }

      const response = toConnectionStatusResponse(conn, statusOverride);

      if (conn.connectionRole === 'source') {
        sourceResponse = response;
      } else if (conn.connectionRole === 'target') {
        targetResponse = response;
      }
    }

    // Also check for pending flows without existing connections (first-time connect)
    if (!sourceResponse) {
      const pendingSource = await repos.oauthPendingFlows.findLiveByProjectAndRole(
        projectId,
        'source'
      );
      if (pendingSource) {
        sourceResponse = {
          id: '',
          connectionRole: 'source',
          salesforceOrgId: '',
          salesforceInstanceUrl: '',
          salesforceUsername: null,
          instanceType: '',
          apiVersion: null,
          status: 'connecting',
          connectionMetadata: null,
          lastUsedAt: null,
          lastSuccessfulApiCallAt: null,
          lastError: null,
          connectedBy: null,
          createdAt: pendingSource.createdAt.toISOString(),
        };
      }
    }

    if (!targetResponse) {
      const pendingTarget = await repos.oauthPendingFlows.findLiveByProjectAndRole(
        projectId,
        'target'
      );
      if (pendingTarget) {
        targetResponse = {
          id: '',
          connectionRole: 'target',
          salesforceOrgId: '',
          salesforceInstanceUrl: '',
          salesforceUsername: null,
          instanceType: '',
          apiVersion: null,
          status: 'connecting',
          connectionMetadata: null,
          lastUsedAt: null,
          lastSuccessfulApiCallAt: null,
          lastError: null,
          connectedBy: null,
          createdAt: pendingTarget.createdAt.toISOString(),
        };
      }
    }

    return c.json({
      success: true,
      data: {
        source: sourceResponse,
        target: targetResponse,
      },
    });
  }
);

// ============================================================================
// ROUTE 4: POST /:projectId/salesforce/disconnect
// ============================================================================

/**
 * POST /v1/projects/:projectId/salesforce/disconnect
 * Disconnect a Salesforce connection (revokes tokens, marks as disconnected).
 */
salesforceRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{projectId}/salesforce/disconnect',
    tags: ['Salesforce'],
    summary: 'Disconnect Salesforce',
    description: 'Revokes tokens and disconnects a Salesforce org.',
    middleware: [authMiddleware, requireRole('org_owner', 'admin')] as const,
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: disconnectBodySchema,
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
        description: 'Connection disconnected successfully',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { connectionRole } = c.req.valid('json');
    const { user, repos } = c.var;

    // Verify project exists and belongs to user's org
    const project = await repos.projects.findById(projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Find connection
    const connection = await repos.salesforceConnections.findByProjectAndRole(
      projectId,
      connectionRole
    );
    if (!connection) {
      throw new AppError(ErrorCodes.NOT_FOUND, `No ${connectionRole} connection found`, 404);
    }

    if (connection.status === 'disconnected') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Connection is already disconnected', 409);
    }

    // Get secrets for token revocation
    const secrets = await repos.salesforceConnectionSecrets.findByConnectionId(connection.id);

    // Try to revoke token at Salesforce (best-effort)
    if (secrets) {
      try {
        const oauthService = createOAuthService();
        await oauthService.revokeToken(connection.oauthBaseUrl, secrets.refreshToken);
      } catch (revokeError) {
        logger.warn(
          'Failed to revoke Salesforce token (continuing with disconnect)',
          { connectionId: connection.id },
          revokeError as Error
        );
      }

      // Delete stored secrets
      await repos.salesforceConnectionSecrets.deleteByConnectionId(connection.id);
    }

    // Mark connection as disconnected
    await repos.salesforceConnections.disconnect(connection.id, user.id);

    // Log disconnect event
    try {
      await repos.salesforceConnectionLogs.create({
        connectionId: connection.id,
        event: 'disconnected',
        details: {
          connectionRole,
          salesforceOrgId: connection.salesforceOrgId,
        },
        performedBy: user.id,
      });
    } catch (logError) {
      logger.warn(
        'Failed to log Salesforce disconnect event',
        { connectionId: connection.id },
        logError as Error
      );
    }

    // Log audit event
    try {
      await repos.auditLogs.create({
        userId: user.id,
        organizationId: user.organizationId,
        action: 'salesforce.disconnected',
        metadata: {
          projectId,
          connectionId: connection.id,
          connectionRole,
          salesforceOrgId: connection.salesforceOrgId,
        },
      });
    } catch (auditError) {
      logger.warn('Failed to create audit log for SF disconnect', {}, auditError as Error);
    }

    logger.info('Salesforce disconnected', {
      connectionId: connection.id,
      connectionRole,
      projectId,
      userId: user.id,
    });

    return c.json({
      success: true,
      message: `Salesforce ${connectionRole} disconnected successfully`,
    });
  }
);

// ============================================================================
// ROUTE 5: POST /:projectId/salesforce/test
// ============================================================================

/**
 * POST /v1/projects/:projectId/salesforce/test
 * Test health of a Salesforce connection.
 */
salesforceRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{projectId}/salesforce/test',
    tags: ['Salesforce'],
    summary: 'Test Salesforce Connection',
    description: 'Tests if the Salesforce connection is healthy by making a lightweight API call.',
    middleware: [authMiddleware, requireRole('org_owner', 'admin', 'operator')] as const,
    request: {
      params: z.object({
        projectId: z.string().uuid(),
      }),
      body: {
        content: {
          'application/json': {
            schema: testBodySchema,
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
              data: z.object({
                healthy: z.boolean(),
                error: z.string().optional(),
              }),
            }),
          },
        },
        description: 'Connection health check result',
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { connectionRole } = c.req.valid('json');
    const { user, repos } = c.var;

    // Verify project exists and belongs to user's org
    const project = await repos.projects.findById(projectId);
    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Project not found', 404);
    }
    if (project.organizationId !== user.organizationId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied', 403);
    }

    // Find connection
    const connection = await repos.salesforceConnections.findByProjectAndRole(
      projectId,
      connectionRole
    );
    if (!connection) {
      throw new AppError(ErrorCodes.NOT_FOUND, `No ${connectionRole} connection found`, 404);
    }

    if (connection.status !== 'active') {
      return c.json({
        success: true,
        data: {
          healthy: false,
          error: `Connection status is "${connection.status}"`,
        },
      });
    }

    // Get secrets
    const secrets = await repos.salesforceConnectionSecrets.findByConnectionId(connection.id);
    if (!secrets) {
      await repos.salesforceConnections.updateStatus(connection.id, 'error', 'Missing credentials');
      return c.json({
        success: true,
        data: {
          healthy: false,
          error: 'Missing connection credentials',
        },
      });
    }

    // Test by calling the versions endpoint
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      let response = await fetch(`${connection.salesforceInstanceUrl}/services/data/`, {
        headers: {
          Authorization: `Bearer ${secrets.accessToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      // If 401, try refreshing the token and retrying
      if (response.status === 401) {
        try {
          const oauthService = createOAuthService();
          const refreshResult = await oauthService.refreshAccessToken(
            connection.oauthBaseUrl,
            secrets.refreshToken
          );

          // Update stored token
          await repos.salesforceConnectionSecrets.updateTokens(
            connection.id,
            refreshResult.accessToken,
            secrets.tokenVersion
          );

          // Retry with new token
          response = await fetch(`${connection.salesforceInstanceUrl}/services/data/`, {
            headers: {
              Authorization: `Bearer ${refreshResult.accessToken}`,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });
        } catch (refreshError) {
          await repos.salesforceConnections.updateStatus(
            connection.id,
            'error',
            'Token refresh failed'
          );
          return c.json({
            success: true,
            data: {
              healthy: false,
              error: 'Token refresh failed. Please reconnect.',
            },
          });
        }
      }

      if (response.ok) {
        // Update last successful API call timestamp
        await repos.salesforceConnections.updateStatus(connection.id, 'active');

        return c.json({
          success: true,
          data: { healthy: true },
        });
      }

      const errorText = await response.text().catch(() => 'Unknown error');
      await repos.salesforceConnections.updateStatus(
        connection.id,
        'error',
        `API returned ${response.status}`
      );

      return c.json({
        success: true,
        data: {
          healthy: false,
          error: `Salesforce API returned ${response.status}: ${errorText.substring(0, 200)}`,
        },
      });
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Connection test failed';
      await repos.salesforceConnections.updateStatus(connection.id, 'error', message);

      return c.json({
        success: true,
        data: {
          healthy: false,
          error: message,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }
);

export { salesforceRouter };
