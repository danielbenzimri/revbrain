/**
 * Base Salesforce HTTP client — auth, retry, error classification.
 *
 * All Salesforce API calls go through this client which handles:
 * - Bearer token injection
 * - Error classification (per Spec Section 19.1)
 * - Retry: 3x for 429/503/UNABLE_TO_LOCK_ROW, exponential backoff
 * - 401 → refresh + retry once
 * - Adaptive throttle with jitter
 * - Per-API-type circuit breakers
 * - API call counter for budget enforcement
 * - Non-JSON response handling (maintenance windows)
 * - Sensitive header redaction in logs
 *
 * See: Implementation Plan Task 2.2
 */

import { logger } from '../lib/logger.ts';
import type { SalesforceAuth } from './auth.ts';
import { AdaptiveThrottle } from './throttle.ts';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.ts';

export type ApiType = 'rest' | 'bulk' | 'tooling' | 'soap';

/** Salesforce error codes that are transient (retryable) */
const RETRYABLE_ERROR_CODES = new Set(['UNABLE_TO_LOCK_ROW', 'QUERY_TIMEOUT']);

/** HTTP status codes that are transient */
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

export interface SfApiCallOptions {
  apiType: ApiType;
  method?: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class SalesforceClient {
  private throttle = new AdaptiveThrottle();
  private circuitBreakers: Record<ApiType, CircuitBreaker>;
  private apiCallCount = 0;
  private maxApiCalls: number;

  constructor(
    private auth: SalesforceAuth,
    maxApiCalls = Infinity
  ) {
    this.maxApiCalls = maxApiCalls;
    this.circuitBreakers = {
      rest: new CircuitBreaker('rest'),
      bulk: new CircuitBreaker('bulk'),
      tooling: new CircuitBreaker('tooling'),
      soap: new CircuitBreaker('soap'),
    };
  }

  /** Get current API call count */
  getApiCallCount(): number {
    return this.apiCallCount;
  }

  /**
   * Make an authenticated Salesforce API call with retry and error handling.
   */
  async request<T = unknown>(options: SfApiCallOptions): Promise<T> {
    // Budget enforcement
    if (this.apiCallCount >= this.maxApiCalls) {
      throw new Error(
        `API budget exhausted: ${this.apiCallCount} calls used, max ${this.maxApiCalls}`
      );
    }

    const breaker = this.circuitBreakers[options.apiType];

    return breaker.execute(async () => {
      return this.doRequestWithRetry<T>(options);
    });
  }

  private async doRequestWithRetry<T>(options: SfApiCallOptions, retryCount = 0): Promise<T> {
    // Throttle
    await this.throttle.throttle();

    const { accessToken, instanceUrl } = await this.auth.getAccessToken();
    const url = `${instanceUrl}${options.path}`;
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });

      this.apiCallCount++;
      const elapsed = Date.now() - startTime;

      // Non-JSON response (maintenance window, HTML error page)
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok && !contentType.includes('application/json')) {
        const body = await response.text();
        logger.warn(
          {
            status: response.status,
            contentType,
            body: body.slice(0, 500),
          },
          'sf_non_json_response'
        );

        if (retryCount < 3) {
          const delay = 1000 * Math.pow(2, retryCount);
          await new Promise((r) => setTimeout(r, delay));
          return this.doRequestWithRetry<T>(options, retryCount + 1);
        }
        throw new Error(`Salesforce returned non-JSON response: ${response.status}`);
      }

      // 401 → refresh token + retry once
      if (response.status === 401 && retryCount === 0) {
        logger.info('sf_401_refreshing_token');
        await this.auth.forceRefresh();
        return this.doRequestWithRetry<T>(options, retryCount + 1);
      }

      // Retryable status codes (429, 503)
      if (RETRYABLE_STATUS_CODES.has(response.status) && retryCount < 3) {
        if (response.status === 429) {
          this.throttle.onRateLimit();
        }
        const delay = 1000 * Math.pow(2, retryCount);
        logger.warn({ status: response.status, retryCount, delay }, 'sf_retryable_error');
        await new Promise((r) => setTimeout(r, delay));
        return this.doRequestWithRetry<T>(options, retryCount + 1);
      }

      // Success path
      if (response.ok) {
        this.throttle.onSuccess(elapsed);
        if (elapsed > 2000) {
          this.throttle.onSlowResponse(elapsed);
        }
        return (await response.json()) as T;
      }

      // Parse error response
      const errorBody = await response.json().catch(() => ({}));
      const errorCode =
        Array.isArray(errorBody) && errorBody[0]?.errorCode
          ? errorBody[0].errorCode
          : ((errorBody as Record<string, unknown>)?.errorCode ?? 'UNKNOWN');

      // Retryable Salesforce error codes
      if (typeof errorCode === 'string' && RETRYABLE_ERROR_CODES.has(errorCode) && retryCount < 3) {
        const delay = 1000 * Math.pow(2, retryCount);
        logger.warn({ errorCode, retryCount, delay }, 'sf_retryable_sf_error');
        await new Promise((r) => setTimeout(r, delay));
        return this.doRequestWithRetry<T>(options, retryCount + 1);
      }

      // REQUEST_LIMIT_EXCEEDED → abort run
      if (errorCode === 'REQUEST_LIMIT_EXCEEDED') {
        throw new Error('Salesforce API daily limit exceeded — aborting run');
      }

      // Non-retryable error
      throw new SalesforceApiError(
        response.status,
        typeof errorCode === 'string' ? errorCode : 'UNKNOWN',
        Array.isArray(errorBody) && errorBody[0]?.message
          ? errorBody[0].message
          : JSON.stringify(errorBody).slice(0, 500)
      );
    } catch (err) {
      if (err instanceof CircuitOpenError || err instanceof SalesforceApiError) {
        throw err;
      }
      // Network errors
      if (retryCount < 3 && err instanceof Error && err.name !== 'AbortError') {
        const delay = 1000 * Math.pow(2, retryCount);
        logger.warn({ error: err.message, retryCount, delay }, 'sf_network_error_retry');
        await new Promise((r) => setTimeout(r, delay));
        return this.doRequestWithRetry<T>(options, retryCount + 1);
      }
      throw err;
    }
  }
}

export class SalesforceApiError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string
  ) {
    super(`Salesforce API error ${statusCode} [${errorCode}]: ${message}`);
    this.name = 'SalesforceApiError';
  }
}

export { CircuitOpenError } from './circuit-breaker.ts';
