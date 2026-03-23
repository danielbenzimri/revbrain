/**
 * Salesforce OAuth 2.0 Service
 *
 * Encapsulates all OAuth logic: SSRF validation, URL generation, PKCE,
 * token exchange, refresh, revocation, and state signing.
 *
 * Does NOT handle token storage — that's the repository layer's job.
 */

import crypto from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

export interface SalesforceTokenResponse {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  idUrl: string;
  issuedAt: string;
  scope: string;
}

export interface SalesforceRefreshResponse {
  accessToken: string;
  instanceUrl: string;
  issuedAt: string;
}

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface ParsedSalesforceId {
  orgId: string;
  userId: string;
}

// ============================================================================
// SSRF Validation
// ============================================================================

/**
 * Allowlist patterns for valid Salesforce login URLs.
 * RFC 952: labels can't start or end with hyphens.
 */
const SALESFORCE_HOSTNAME_PATTERNS = [
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.my\.salesforce\.com$/,
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.my\.salesforce\.mil$/,
];

const SALESFORCE_EXACT_HOSTS = new Set(['login.salesforce.com', 'test.salesforce.com']);

// ============================================================================
// Service
// ============================================================================

export class SalesforceOAuthService {
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly callbackUrl: string;
  private readonly stateSecret: Buffer;

  constructor(config: {
    consumerKey: string;
    consumerSecret: string;
    callbackUrl: string;
    stateSigningSecret: string;
  }) {
    this.consumerKey = config.consumerKey;
    this.consumerSecret = config.consumerSecret;
    this.callbackUrl = config.callbackUrl;
    this.stateSecret = Buffer.from(config.stateSigningSecret, 'base64');
  }

  // --------------------------------------------------------------------------
  // SSRF Prevention
  // --------------------------------------------------------------------------

  /**
   * Validate a user-provided Salesforce login URL.
   * Returns the normalized origin if valid, throws if not.
   *
   * Rules:
   * - Must be HTTPS
   * - Hostname must be a known Salesforce domain (allowlisted patterns)
   * - No IP literals, localhost, or RFC1918 private addresses
   */
  validateLoginUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('Login URL must use HTTPS');
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check exact matches first
    if (SALESFORCE_EXACT_HOSTS.has(hostname)) {
      return parsed.origin;
    }

    // Check pattern matches
    const matchesPattern = SALESFORCE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));

    if (!matchesPattern) {
      throw new Error(
        `Invalid Salesforce login URL: hostname "${hostname}" is not a recognized Salesforce domain`
      );
    }

    return parsed.origin;
  }

  /**
   * Determine the OAuth base URL based on instance type and optional custom URL.
   * This base URL is used for ALL OAuth operations (authorize, token, refresh, revoke).
   */
  determineOAuthBaseUrl(instanceType: 'production' | 'sandbox', loginUrl?: string): string {
    if (loginUrl) {
      return this.validateLoginUrl(loginUrl);
    }

    return instanceType === 'sandbox'
      ? 'https://test.salesforce.com'
      : 'https://login.salesforce.com';
  }

  // --------------------------------------------------------------------------
  // PKCE
  // --------------------------------------------------------------------------

  /**
   * Generate a PKCE code verifier and challenge pair.
   * Verifier: 64 random bytes, base64url-encoded (86 chars).
   * Challenge: SHA-256 hash of verifier, base64url-encoded.
   */
  generatePKCE(): PKCEPair {
    const codeVerifier = crypto.randomBytes(64).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  // --------------------------------------------------------------------------
  // State Signing (HMAC-based, no external JWT library)
  // --------------------------------------------------------------------------

  /**
   * Create a signed state token containing a nonce and expiry.
   * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
   */
  signState(nonce: string, expiresInSeconds: number = 600): string {
    const payload = {
      nonce,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.stateSecret)
      .update(payloadB64)
      .digest('base64url');

    return `${payloadB64}.${signature}`;
  }

  /**
   * Verify and decode a signed state token.
   * Throws if signature is invalid or token is expired.
   */
  verifyState(state: string): { nonce: string } {
    const dotIndex = state.indexOf('.');
    if (dotIndex === -1) {
      throw new Error('Invalid state format');
    }

    const payloadB64 = state.substring(0, dotIndex);
    const providedSignature = state.substring(dotIndex + 1);

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', this.stateSecret)
      .update(payloadB64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      throw new Error('Invalid state signature');
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      nonce: string;
      exp: number;
    };

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('State token has expired');
    }

    return { nonce: payload.nonce };
  }

  // --------------------------------------------------------------------------
  // URL Generation
  // --------------------------------------------------------------------------

  /**
   * Construct the Salesforce OAuth authorization URL.
   */
  generateAuthorizationUrl(oauthBaseUrl: string, codeChallenge: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.consumerKey,
      redirect_uri: this.callbackUrl,
      scope: 'api refresh_token id',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'login consent',
    });

    return `${oauthBaseUrl}/services/oauth2/authorize?${params.toString()}`;
  }

  // --------------------------------------------------------------------------
  // Token Exchange
  // --------------------------------------------------------------------------

  /**
   * Exchange an authorization code for access + refresh tokens.
   * Uses the SAME oauthBaseUrl that was used for authorization.
   */
  async exchangeCodeForTokens(
    oauthBaseUrl: string,
    code: string,
    codeVerifier: string
  ): Promise<SalesforceTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.consumerKey,
      client_secret: this.consumerSecret,
      redirect_uri: this.callbackUrl,
      code_verifier: codeVerifier,
    });

    const response = await fetch(`${oauthBaseUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Salesforce token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as Record<string, string>;

    return {
      accessToken: data['access_token']!,
      refreshToken: data['refresh_token']!,
      instanceUrl: data['instance_url']!, // Note: Salesforce uses underscore
      idUrl: data['id']!,
      issuedAt: data['issued_at']!,
      scope: data['scope']!,
    };
  }

  /**
   * Refresh an access token using a refresh token.
   * Uses the SAME oauthBaseUrl stored with the connection.
   */
  async refreshAccessToken(
    oauthBaseUrl: string,
    refreshToken: string
  ): Promise<SalesforceRefreshResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.consumerKey,
      client_secret: this.consumerSecret,
    });

    const response = await fetch(`${oauthBaseUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Salesforce token refresh failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as Record<string, string>;

    return {
      accessToken: data['access_token']!,
      instanceUrl: data['instance_url']!,
      issuedAt: data['issued_at']!,
    };
  }

  /**
   * Revoke a token (access or refresh) at Salesforce.
   * Form-encoded POST to the revocation endpoint.
   */
  async revokeToken(oauthBaseUrl: string, token: string): Promise<void> {
    const body = new URLSearchParams({ token });

    const response = await fetch(`${oauthBaseUrl}/services/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Salesforce token revocation failed (${response.status}): ${errorBody}`);
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Parse org ID and user ID from Salesforce's token response `id` URL.
   * Canonical source — don't extract from access token prefix.
   *
   * Format: https://login.salesforce.com/id/{orgId}/{userId}
   */
  parseOrgAndUserFromIdUrl(idUrl: string): ParsedSalesforceId {
    const parts = idUrl.split('/');
    const userId = parts.pop();
    const orgId = parts.pop();

    if (!orgId || !userId) {
      throw new Error(`Cannot parse org/user ID from Salesforce id URL: ${idUrl}`);
    }

    return { orgId, userId };
  }
}
