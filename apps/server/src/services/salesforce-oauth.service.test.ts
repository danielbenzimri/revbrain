import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { SalesforceOAuthService } from './salesforce-oauth.service.ts';

function createService(): SalesforceOAuthService {
  return new SalesforceOAuthService({
    consumerKey: 'test-consumer-key',
    consumerSecret: 'test-consumer-secret',
    callbackUrl: 'http://localhost:5173/api/v1/salesforce/oauth/callback',
    stateSigningSecret: crypto.randomBytes(32).toString('base64'),
  });
}

describe('SalesforceOAuthService', () => {
  let service: SalesforceOAuthService;

  beforeEach(() => {
    service = createService();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // SSRF Validation (Tests 1-10)
  // --------------------------------------------------------------------------

  describe('validateLoginUrl', () => {
    it('1. should accept https://acme.my.salesforce.com', () => {
      expect(service.validateLoginUrl('https://acme.my.salesforce.com')).toBe(
        'https://acme.my.salesforce.com'
      );
    });

    it('2. should accept https://login.salesforce.com', () => {
      expect(service.validateLoginUrl('https://login.salesforce.com')).toBe(
        'https://login.salesforce.com'
      );
    });

    it('3. should accept https://test.salesforce.com', () => {
      expect(service.validateLoginUrl('https://test.salesforce.com')).toBe(
        'https://test.salesforce.com'
      );
    });

    it('4. should reject http:// (not HTTPS)', () => {
      expect(() => service.validateLoginUrl('http://acme.my.salesforce.com')).toThrow('HTTPS');
    });

    it('5. should reject https://evil.com', () => {
      expect(() => service.validateLoginUrl('https://evil.com')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('6. should reject https://evil.com.my.salesforce.com (multi-label subdomain)', () => {
      expect(() => service.validateLoginUrl('https://evil.com.my.salesforce.com')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('7. should reject https://127.0.0.1', () => {
      expect(() => service.validateLoginUrl('https://127.0.0.1')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('8. should reject https://localhost', () => {
      expect(() => service.validateLoginUrl('https://localhost')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('9. should reject https://192.168.1.1', () => {
      expect(() => service.validateLoginUrl('https://192.168.1.1')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('10. should reject https://my.salesforce.com (no subdomain)', () => {
      expect(() => service.validateLoginUrl('https://my.salesforce.com')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('should accept sandbox-style domains with double hyphens', () => {
      expect(service.validateLoginUrl('https://acme--uat.my.salesforce.com')).toBe(
        'https://acme--uat.my.salesforce.com'
      );
    });

    it('should reject leading hyphen in subdomain', () => {
      expect(() => service.validateLoginUrl('https://-acme.my.salesforce.com')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('should reject trailing hyphen in subdomain', () => {
      expect(() => service.validateLoginUrl('https://acme-.my.salesforce.com')).toThrow(
        'not a recognized Salesforce domain'
      );
    });

    it('should accept .mil variant', () => {
      expect(service.validateLoginUrl('https://govorg.my.salesforce.mil')).toBe(
        'https://govorg.my.salesforce.mil'
      );
    });
  });

  // --------------------------------------------------------------------------
  // determineOAuthBaseUrl (Tests 11-13)
  // --------------------------------------------------------------------------

  describe('determineOAuthBaseUrl', () => {
    it('11. should return login.salesforce.com for production', () => {
      expect(service.determineOAuthBaseUrl('production')).toBe('https://login.salesforce.com');
    });

    it('12. should return test.salesforce.com for sandbox', () => {
      expect(service.determineOAuthBaseUrl('sandbox')).toBe('https://test.salesforce.com');
    });

    it('13. should use custom URL when provided for production', () => {
      expect(service.determineOAuthBaseUrl('production', 'https://acme.my.salesforce.com')).toBe(
        'https://acme.my.salesforce.com'
      );
    });

    it('should validate custom URL (reject bad ones)', () => {
      expect(() => service.determineOAuthBaseUrl('production', 'https://evil.com')).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // PKCE (Test 14)
  // --------------------------------------------------------------------------

  describe('generatePKCE', () => {
    it('14. should return verifier (43-128 chars) and challenge (base64url SHA256)', () => {
      const { codeVerifier, codeChallenge } = service.generatePKCE();

      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeVerifier.length).toBeLessThanOrEqual(128);

      // Verify challenge is SHA256 of verifier
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      expect(codeChallenge).toBe(expectedChallenge);
    });

    it('should generate unique pairs on each call', () => {
      const pair1 = service.generatePKCE();
      const pair2 = service.generatePKCE();
      expect(pair1.codeVerifier).not.toBe(pair2.codeVerifier);
    });
  });

  // --------------------------------------------------------------------------
  // State Signing (Tests 15-17)
  // --------------------------------------------------------------------------

  describe('signState / verifyState', () => {
    it('15. should roundtrip: sign then verify returns same nonce', () => {
      const nonce = crypto.randomUUID();
      const state = service.signState(nonce);
      const result = service.verifyState(state);
      expect(result.nonce).toBe(nonce);
    });

    it('16. should throw for expired state', () => {
      const nonce = crypto.randomUUID();
      const state = service.signState(nonce, -1); // Already expired
      expect(() => service.verifyState(state)).toThrow('expired');
    });

    it('17. should throw for tampered state', () => {
      const state = service.signState(crypto.randomUUID());
      const tampered = state.slice(0, -1) + (state.endsWith('A') ? 'B' : 'A');
      expect(() => service.verifyState(tampered)).toThrow('signature');
    });

    it('should throw for invalid format (no dot)', () => {
      expect(() => service.verifyState('nodothere')).toThrow('format');
    });

    it('should reject state signed with different secret', () => {
      const otherService = createService(); // Different random secret
      const state = otherService.signState(crypto.randomUUID());
      expect(() => service.verifyState(state)).toThrow('signature');
    });
  });

  // --------------------------------------------------------------------------
  // Token Exchange (Tests 18-20)
  // --------------------------------------------------------------------------

  describe('exchangeCodeForTokens', () => {
    it('18. should send correct POST body', async () => {
      const mockResponse = {
        access_token: 'access_123',
        refresh_token: 'refresh_456',
        instance_url: 'https://acme.my.salesforce.com',
        id: 'https://login.salesforce.com/id/00Dxx/005xx',
        issued_at: '1711152000000',
        scope: 'api refresh_token id',
      };

      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      await service.exchangeCodeForTokens(
        'https://login.salesforce.com',
        'auth_code_123',
        'verifier_456'
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://login.salesforce.com/services/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      // Verify the body contains expected parameters
      const callArgs = vi.mocked(fetch).mock.calls[0]!;
      const body = callArgs[1]?.body as string;
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=auth_code_123');
      expect(body).toContain('code_verifier=verifier_456');
      expect(body).toContain('client_id=test-consumer-key');
      expect(body).toContain('client_secret=test-consumer-secret');
    });

    it('19. should return parsed token response on 200', async () => {
      const mockResponse = {
        access_token: 'access_123',
        refresh_token: 'refresh_456',
        instance_url: 'https://acme.my.salesforce.com',
        id: 'https://login.salesforce.com/id/00Dxx/005xx',
        issued_at: '1711152000000',
        scope: 'api refresh_token id',
      };

      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const result = await service.exchangeCodeForTokens(
        'https://login.salesforce.com',
        'code',
        'verifier'
      );

      expect(result.accessToken).toBe('access_123');
      expect(result.refreshToken).toBe('refresh_456');
      expect(result.instanceUrl).toBe('https://acme.my.salesforce.com');
      expect(result.idUrl).toBe('https://login.salesforce.com/id/00Dxx/005xx');
    });

    it('20. should throw on non-200 response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('{"error":"invalid_grant"}', { status: 400 })
      );

      await expect(
        service.exchangeCodeForTokens('https://login.salesforce.com', 'bad_code', 'verifier')
      ).rejects.toThrow('token exchange failed (400)');
    });
  });

  // --------------------------------------------------------------------------
  // Refresh (Test 21)
  // --------------------------------------------------------------------------

  describe('refreshAccessToken', () => {
    it('21. should send correct POST body with same oauthBaseUrl', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'new_access',
            instance_url: 'https://acme.my.salesforce.com',
            issued_at: '1711200000000',
          }),
          { status: 200 }
        )
      );

      const result = await service.refreshAccessToken(
        'https://test.salesforce.com', // Sandbox URL
        'refresh_token_value'
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://test.salesforce.com/services/oauth2/token', // Same base URL
        expect.anything()
      );

      const body = vi.mocked(fetch).mock.calls[0]![1]?.body as string;
      expect(body).toContain('grant_type=refresh_token');
      expect(body).toContain('refresh_token=refresh_token_value');

      expect(result.accessToken).toBe('new_access');
    });
  });

  // --------------------------------------------------------------------------
  // Revocation (Test 22)
  // --------------------------------------------------------------------------

  describe('revokeToken', () => {
    it('22. should send form-encoded POST to /services/oauth2/revoke', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      await service.revokeToken('https://login.salesforce.com', 'token_to_revoke');

      expect(fetch).toHaveBeenCalledWith(
        'https://login.salesforce.com/services/oauth2/revoke',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      const body = vi.mocked(fetch).mock.calls[0]![1]?.body as string;
      expect(body).toContain('token=token_to_revoke');
    });

    it('should throw on revocation failure', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      await expect(
        service.revokeToken('https://login.salesforce.com', 'bad_token')
      ).rejects.toThrow('revocation failed');
    });
  });

  // --------------------------------------------------------------------------
  // ID URL Parsing
  // --------------------------------------------------------------------------

  describe('parseOrgAndUserFromIdUrl', () => {
    it('should parse org and user IDs from standard id URL', () => {
      const result = service.parseOrgAndUserFromIdUrl(
        'https://login.salesforce.com/id/00Dxx0000001234/005xx0000009876'
      );
      expect(result.orgId).toBe('00Dxx0000001234');
      expect(result.userId).toBe('005xx0000009876');
    });

    it('should handle custom domain id URLs', () => {
      const result = service.parseOrgAndUserFromIdUrl(
        'https://acme.my.salesforce.com/id/00D5g00000XXXXX/0055g00000YYYYY'
      );
      expect(result.orgId).toBe('00D5g00000XXXXX');
      expect(result.userId).toBe('0055g00000YYYYY');
    });

    it('should throw for malformed id URL', () => {
      expect(() => service.parseOrgAndUserFromIdUrl('https://login.salesforce.com/id/')).toThrow(
        'Cannot parse'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Authorization URL
  // --------------------------------------------------------------------------

  describe('generateAuthorizationUrl', () => {
    it('should include all required OAuth parameters', () => {
      const url = service.generateAuthorizationUrl(
        'https://login.salesforce.com',
        'challenge_value',
        'state_value'
      );

      expect(url).toContain('https://login.salesforce.com/services/oauth2/authorize?');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test-consumer-key');
      expect(url).toContain('scope=api+refresh_token+id');
      expect(url).toContain('code_challenge=challenge_value');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('state=state_value');
      expect(url).toContain('prompt=login+consent');
    });
  });
});
