import { describe, it, expect } from 'vitest';
import { AdaptiveThrottle } from '../../src/salesforce/throttle.ts';
import { CircuitBreaker, CircuitOpenError } from '../../src/salesforce/circuit-breaker.ts';

describe('AdaptiveThrottle', () => {
  it('should start with 0ms delay', () => {
    const throttle = new AdaptiveThrottle();
    expect(throttle.getCurrentDelay()).toBe(0);
  });

  it('should increase delay on rate limit', () => {
    const throttle = new AdaptiveThrottle();
    throttle.onRateLimit();
    expect(throttle.getCurrentDelay()).toBeGreaterThanOrEqual(1000);
  });

  it('should cap delay at 16s', () => {
    const throttle = new AdaptiveThrottle();
    for (let i = 0; i < 20; i++) {
      throttle.onRateLimit();
    }
    expect(throttle.getCurrentDelay()).toBeLessThanOrEqual(16000);
  });

  it('should decrease delay after consecutive fast successes', () => {
    const throttle = new AdaptiveThrottle();
    throttle.onRateLimit(); // Set some delay
    const delayAfterRateLimit = throttle.getCurrentDelay();

    // 6 consecutive fast successes
    for (let i = 0; i < 6; i++) {
      throttle.onSuccess(500);
    }
    expect(throttle.getCurrentDelay()).toBeLessThan(delayAfterRateLimit);
  });

  it('should increase delay on slow response', () => {
    const throttle = new AdaptiveThrottle();
    throttle.onSlowResponse(3000);
    expect(throttle.getCurrentDelay()).toBe(100);
  });
});

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const breaker = new CircuitBreaker('rest');
    expect(breaker.getState()).toBe('closed');
  });

  it('should open after 5 consecutive failures', async () => {
    const breaker = new CircuitBreaker('rest');
    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
    }
    expect(breaker.getState()).toBe('open');
    expect(breaker.getFailures()).toBe(5);
  });

  it('should throw CircuitOpenError when open', async () => {
    const breaker = new CircuitBreaker('rest');
    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
    }

    await expect(breaker.execute(() => Promise.resolve('test'))).rejects.toThrow(CircuitOpenError);
  });

  it('should reset on success', async () => {
    const breaker = new CircuitBreaker('rest');
    // 4 failures (not enough to open)
    for (let i = 0; i < 4; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
    }
    expect(breaker.getFailures()).toBe(4);

    // 1 success resets
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getFailures()).toBe(0);
    expect(breaker.getState()).toBe('closed');
  });
});

describe('SalesforceClient', () => {
  it('should export SalesforceClient class', async () => {
    const mod = await import('../../src/salesforce/client.ts');
    expect(mod.SalesforceClient).toBeDefined();
    expect(mod.SalesforceApiError).toBeDefined();
  });
});
