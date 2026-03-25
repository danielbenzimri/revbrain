import { describe, it, expect, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

// We test the logger module's patterns directly using a custom pino instance
// that writes to a buffer, so we can inspect output.

function createTestLogger(storage: AsyncLocalStorage<Record<string, unknown>>) {
  const lines: string[] = [];

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trim());
      callback();
    },
  });

  const log = pino(
    {
      level: 'trace',
      redact: {
        paths: [
          'accessToken',
          'refreshToken',
          'password',
          'secret',
          '*.accessToken',
          '*.refreshToken',
          '*.password',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
      mixin() {
        return storage.getStore() ?? {};
      },
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream
  );

  return { log, lines, stream };
}

describe('logger', () => {
  let storage: AsyncLocalStorage<Record<string, unknown>>;

  beforeEach(() => {
    storage = new AsyncLocalStorage();
  });

  it('should output valid JSON', () => {
    const { log, lines } = createTestLogger(storage);
    log.info('test message');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe('test message');
    expect(parsed.level).toBe('info');
  });

  it('should include ISO timestamp', () => {
    const { log, lines } = createTestLogger(storage);
    log.info('test');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should redact sensitive fields', () => {
    const { log, lines } = createTestLogger(storage);
    log.info({ accessToken: 'secret-value', refreshToken: 'also-secret' }, 'auth event');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.accessToken).toBe('[REDACTED]');
    expect(parsed.refreshToken).toBe('[REDACTED]');
    expect(parsed.msg).toBe('auth event');
  });

  it('should redact nested sensitive fields', () => {
    const { log, lines } = createTestLogger(storage);
    log.info({ data: { password: 'hunter2', secret: 'abc' } }, 'nested');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.data.password).toBe('[REDACTED]');
    expect(parsed.data.secret).toBe('[REDACTED]');
  });

  it('should propagate AsyncLocalStorage context into log output', async () => {
    const { log, lines } = createTestLogger(storage);

    await storage.run({ traceId: 'trace-123', runId: 'run-456', jobId: 'job-789' }, async () => {
      log.info('inside context');

      // Verify context propagates through nested async
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          log.info('nested async');
          resolve();
        }, 10);
      });
    });

    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.traceId).toBe('trace-123');
    expect(first.runId).toBe('run-456');
    expect(first.jobId).toBe('job-789');
    expect(first.msg).toBe('inside context');

    const second = JSON.parse(lines[1]);
    expect(second.traceId).toBe('trace-123');
    expect(second.msg).toBe('nested async');
  });

  it('should not include context fields when outside AsyncLocalStorage', () => {
    const { log, lines } = createTestLogger(storage);
    log.info('no context');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.traceId).toBeUndefined();
    expect(parsed.runId).toBeUndefined();
  });

  it('should support child loggers with additional bindings', () => {
    const { log, lines } = createTestLogger(storage);
    const child = log.child({ collector: 'catalog' });

    storage.run({ traceId: 't1', runId: 'r1' }, () => {
      child.info('collector log');
    });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.collector).toBe('catalog');
    expect(parsed.traceId).toBe('t1');
    expect(parsed.runId).toBe('r1');
  });
});
