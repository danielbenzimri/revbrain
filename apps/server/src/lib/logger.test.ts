import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { logger } from './logger.ts';

describe('Logger', () => {
  const consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should log info messages to console.log', () => {
      logger.info('test message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.level).toBe('info');
      expect(output.message).toBe('test message');
      expect(output.timestamp).toBeDefined();
    });

    it('should log warn messages to console.warn', () => {
      logger.warn('warning message');

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleSpy.warn.mock.calls[0][0]);
      expect(output.level).toBe('warn');
    });

    it('should log error messages to console.error', () => {
      logger.error('error message');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
      expect(output.level).toBe('error');
    });

    it('should log debug messages to console.debug', () => {
      logger.debug('debug message');

      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleSpy.debug.mock.calls[0][0]);
      expect(output.level).toBe('debug');
    });
  });

  describe('context', () => {
    it('should include context in log output', () => {
      logger.info('test', { requestId: '123', userId: 'user-1' });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.context.requestId).toBe('123');
      expect(output.context.userId).toBe('user-1');
    });
  });

  describe('sensitive data scrubbing', () => {
    it('should redact password fields', () => {
      logger.info('login attempt', { password: 'secret123', username: 'john' });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.context.password).toBe('[REDACTED]');
      expect(output.context.username).toBe('john');
    });

    it('should redact token fields', () => {
      logger.info('auth', { token: 'abc123', apiKey: 'key123' });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.context.token).toBe('[REDACTED]');
      expect(output.context.apiKey).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', () => {
      logger.info('request', {
        headers: { authorization: 'Bearer token', contentType: 'json' },
      });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.context.headers.authorization).toBe('[REDACTED]');
      expect(output.context.headers.contentType).toBe('json');
    });
  });

  describe('error logging', () => {
    it('should include error details when provided', () => {
      const error = new Error('Something went wrong');
      error.name = 'TestError';
      logger.error('operation failed', { requestId: '123' }, error);

      const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
      expect(output.error.name).toBe('TestError');
      expect(output.error.message).toBe('Something went wrong');
    });
  });

  describe('child logger', () => {
    it('should include bound context in all logs', () => {
      const childLogger = logger.child({ requestId: 'req-123', service: 'auth' });

      childLogger.info('test message', { extra: 'data' });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.context.requestId).toBe('req-123');
      expect(output.context.service).toBe('auth');
      expect(output.context.extra).toBe('data');
    });

    it('should allow overriding bound context', () => {
      const childLogger = logger.child({ requestId: 'req-123' });

      childLogger.info('test', { requestId: 'req-456' });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.context.requestId).toBe('req-456');
    });
  });
});
