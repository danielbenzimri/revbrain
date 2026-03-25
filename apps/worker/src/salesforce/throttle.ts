/**
 * Adaptive rate limiter with jitter for Salesforce API calls.
 *
 * - Starts with 0ms delay
 * - On rate limit (429): doubles delay + 30% jitter, cap at 16s
 * - On slow response (>2s): increases delay by 100ms
 * - On success + fast response: decreases delay after 5 consecutive
 *
 * See: Architecture Spec Section 10.2
 */

export class AdaptiveThrottle {
  private delayMs = 0;
  private consecutiveSuccesses = 0;

  async throttle(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
  }

  onSuccess(responseTimeMs: number): void {
    this.consecutiveSuccesses++;
    if (responseTimeMs < 1000 && this.consecutiveSuccesses > 5) {
      this.delayMs = Math.max(0, this.delayMs - 50);
    }
  }

  onRateLimit(): void {
    this.consecutiveSuccesses = 0;
    const base = Math.max(1000, this.delayMs * 2);
    const jitter = Math.random() * base * 0.3;
    this.delayMs = Math.min(16000, base + jitter);
  }

  onSlowResponse(responseTimeMs: number): void {
    if (responseTimeMs > 2000) {
      this.delayMs = Math.min(2000, this.delayMs + 100);
    }
  }

  getCurrentDelay(): number {
    return this.delayMs;
  }
}
