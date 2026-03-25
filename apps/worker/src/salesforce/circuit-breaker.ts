/**
 * Per-API-type circuit breaker for Salesforce endpoints.
 *
 * Independent state machines for REST, Bulk, Tooling, SOAP.
 * - Closed → Open after 5 consecutive failures
 * - Open → Half-open after 60s
 * - Half-open → Closed on success, Open on failure
 *
 * See: Architecture Spec Section 10.3
 */

export class CircuitOpenError extends Error {
  constructor(public apiType: string) {
    super(`Circuit breaker open for ${apiType}`);
    this.name = 'CircuitOpenError';
  }
}

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'closed';
  private openedAt?: number;
  private readonly threshold = 5;
  private readonly resetTimeout = 60_000; // 60s

  constructor(public readonly apiType: string) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.openedAt ?? 0) > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError(this.apiType);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}
