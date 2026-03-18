/**
 * AlertingService Unit Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AlertChannel, AlertResult } from '@revbrain/contract';
import { AlertingService } from './alerting.service.ts';

// Mock logger
vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Create a mock channel for testing
 */
function createMockChannel(
  name: string,
  options?: {
    configured?: boolean;
    shouldFail?: boolean;
    delay?: number;
  }
): AlertChannel & { sendMock: ReturnType<typeof vi.fn> } {
  const sendMock = vi.fn().mockImplementation(async (): Promise<AlertResult> => {
    if (options?.delay) {
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    }
    if (options?.shouldFail) {
      return { channel: name, success: false, error: 'Mock failure' };
    }
    return { channel: name, success: true };
  });

  return {
    name,
    isConfigured: () => options?.configured ?? true,
    send: sendMock,
    sendMock,
  };
}

describe('AlertingService', () => {
  let service: AlertingService;

  beforeEach(() => {
    service = new AlertingService({ environment: 'test' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('channel registration', () => {
    it('should register a configured channel', () => {
      const channel = createMockChannel('test-channel');

      service.registerChannel(channel);

      expect(service.getConfiguredChannels()).toContain('test-channel');
    });

    it('should skip unconfigured channels', () => {
      const channel = createMockChannel('unconfigured', { configured: false });

      service.registerChannel(channel);

      expect(service.getConfiguredChannels()).not.toContain('unconfigured');
    });

    it('should register multiple channels', () => {
      const channel1 = createMockChannel('channel-1');
      const channel2 = createMockChannel('channel-2');

      service.registerChannel(channel1);
      service.registerChannel(channel2);

      expect(service.getConfiguredChannels()).toEqual(['channel-1', 'channel-2']);
    });
  });

  describe('send', () => {
    it('should send alert to all registered channels', async () => {
      const channel1 = createMockChannel('channel-1');
      const channel2 = createMockChannel('channel-2');

      service.registerChannel(channel1);
      service.registerChannel(channel2);

      const results = await service.send({
        title: 'Test Alert',
        message: 'This is a test',
        severity: 'info',
        category: 'system',
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ channel: 'channel-1', success: true });
      expect(results[1]).toEqual({ channel: 'channel-2', success: true });
      expect(channel1.sendMock).toHaveBeenCalledTimes(1);
      expect(channel2.sendMock).toHaveBeenCalledTimes(1);
    });

    it('should add id and timestamp to alert', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.send({
        title: 'Test',
        message: 'Test message',
        severity: 'info',
        category: 'system',
      });

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.id).toBeDefined();
      expect(sentAlert.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(sentAlert.timestamp).toBeDefined();
      expect(new Date(sentAlert.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should add environment to context', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.send({
        title: 'Test',
        message: 'Test message',
        severity: 'info',
        category: 'system',
      });

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.context?.environment).toBe('test');
    });

    it('should send to specific channels when specified', async () => {
      const channel1 = createMockChannel('channel-1');
      const channel2 = createMockChannel('channel-2');

      service.registerChannel(channel1);
      service.registerChannel(channel2);

      const results = await service.send(
        {
          title: 'Test',
          message: 'Test message',
          severity: 'info',
          category: 'system',
        },
        { channels: ['channel-1'] }
      );

      expect(results).toHaveLength(1);
      expect(results[0].channel).toBe('channel-1');
      expect(channel1.sendMock).toHaveBeenCalledTimes(1);
      expect(channel2.sendMock).not.toHaveBeenCalled();
    });

    it('should handle channel failures gracefully', async () => {
      const successChannel = createMockChannel('success');
      const failChannel = createMockChannel('fail', { shouldFail: true });

      service.registerChannel(successChannel);
      service.registerChannel(failChannel);

      const results = await service.send({
        title: 'Test',
        message: 'Test message',
        severity: 'info',
        category: 'system',
      });

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.channel === 'success')?.success).toBe(true);
      expect(results.find((r) => r.channel === 'fail')?.success).toBe(false);
    });

    it('should handle channel exceptions', async () => {
      const channel = createMockChannel('throwing');
      channel.sendMock.mockRejectedValue(new Error('Channel crashed'));

      service.registerChannel(channel);

      const results = await service.send({
        title: 'Test',
        message: 'Test message',
        severity: 'info',
        category: 'system',
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Channel crashed');
    });

    it('should return empty array when no channels configured', async () => {
      const results = await service.send({
        title: 'Test',
        message: 'Test message',
        severity: 'info',
        category: 'system',
      });

      expect(results).toEqual([]);
    });
  });

  describe('convenience methods', () => {
    it('critical() should send with critical severity', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.critical('Critical Alert', 'Something bad happened');

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.severity).toBe('critical');
      expect(sentAlert.title).toBe('Critical Alert');
      expect(sentAlert.message).toBe('Something bad happened');
      expect(sentAlert.tags).toContain('critical');
    });

    it('warning() should send with warning severity', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.warning('Warning Alert', 'Something concerning');

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.severity).toBe('warning');
      expect(sentAlert.tags).toContain('warning');
    });

    it('info() should send with info severity', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.info('Info Alert', 'FYI');

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.severity).toBe('info');
      expect(sentAlert.tags).toContain('info');
    });

    it('should include context in convenience methods', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.critical('Test', 'Message', {
        userId: 'user-123',
        organizationId: 'org-456',
      });

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.context?.userId).toBe('user-123');
      expect(sentAlert.context?.organizationId).toBe('org-456');
    });
  });

  describe('throttling', () => {
    it('should throttle repeated alerts', async () => {
      const throttleService = new AlertingService({
        throttle: { windowMs: 60000, maxPerWindow: 2 },
      });
      const channel = createMockChannel('test');
      throttleService.registerChannel(channel);

      // First two should succeed
      await throttleService.critical('Same Alert', 'Message 1');
      await throttleService.critical('Same Alert', 'Message 2');

      // Third should be throttled
      const results = await throttleService.critical('Same Alert', 'Message 3');

      expect(channel.sendMock).toHaveBeenCalledTimes(2);
      expect(results[0].throttled).toBe(true);
      expect(results[0].success).toBe(false);
    });

    it('should not throttle different alerts', async () => {
      const throttleService = new AlertingService({
        throttle: { windowMs: 60000, maxPerWindow: 1 },
      });
      const channel = createMockChannel('test');
      throttleService.registerChannel(channel);

      await throttleService.critical('Alert 1', 'Message');
      await throttleService.critical('Alert 2', 'Message');
      await throttleService.warning('Alert 1', 'Message'); // Different severity

      expect(channel.sendMock).toHaveBeenCalledTimes(3);
    });

    it('should bypass throttle when option set', async () => {
      const throttleService = new AlertingService({
        throttle: { windowMs: 60000, maxPerWindow: 1 },
      });
      const channel = createMockChannel('test');
      throttleService.registerChannel(channel);

      await throttleService.critical('Same Alert', 'Message 1');
      await throttleService.send(
        {
          title: 'Same Alert',
          message: 'Message 2',
          severity: 'critical',
          category: 'error',
        },
        { bypassThrottle: true }
      );

      expect(channel.sendMock).toHaveBeenCalledTimes(2);
    });

    it('should reset throttle after window expires', async () => {
      const throttleService = new AlertingService({
        throttle: { windowMs: 50, maxPerWindow: 1 }, // 50ms window
      });
      const channel = createMockChannel('test');
      throttleService.registerChannel(channel);

      await throttleService.critical('Same Alert', 'Message 1');

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      await throttleService.critical('Same Alert', 'Message 2');

      expect(channel.sendMock).toHaveBeenCalledTimes(2);
    });

    it('clearThrottle() should reset all throttle state', async () => {
      const throttleService = new AlertingService({
        throttle: { windowMs: 60000, maxPerWindow: 1 },
      });
      const channel = createMockChannel('test');
      throttleService.registerChannel(channel);

      await throttleService.critical('Same Alert', 'Message 1');
      throttleService.clearThrottle();
      await throttleService.critical('Same Alert', 'Message 2');

      expect(channel.sendMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('category inference', () => {
    it('should infer error category from stack trace', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.warning('Problem', 'Something went wrong', {
        stack: 'Error: test\n  at test.ts:1',
      });

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.category).toBe('error');
    });

    it('should infer security category from auth keywords', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.warning('Auth Failed', 'Unauthorized access attempt');

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.category).toBe('security');
    });

    it('should infer billing category from payment keywords', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.info('Payment', 'Subscription payment received');

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.category).toBe('billing');
    });

    it('should infer performance category from timeout keywords', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      await service.warning('Slow Response', 'API timeout detected');

      const sentAlert = channel.sendMock.mock.calls[0][0];
      expect(sentAlert.category).toBe('performance');
    });
  });

  describe('scoped alerter', () => {
    it('should create scoped alerter with preset context', async () => {
      const channel = createMockChannel('test');
      service.registerChannel(channel);

      const scoped = service.scoped({
        userId: 'user-123',
        organizationId: 'org-456',
      });

      await scoped.critical('Test', 'Message');
      await scoped.warning('Test 2', 'Message 2');

      expect(channel.sendMock).toHaveBeenCalledTimes(2);

      const alert1 = channel.sendMock.mock.calls[0][0];
      const alert2 = channel.sendMock.mock.calls[1][0];

      expect(alert1.context?.userId).toBe('user-123');
      expect(alert1.context?.organizationId).toBe('org-456');
      expect(alert2.context?.userId).toBe('user-123');
      expect(alert2.context?.organizationId).toBe('org-456');
    });
  });

  describe('concurrent sending', () => {
    it('should send to all channels concurrently', async () => {
      const slowChannel = createMockChannel('slow', { delay: 50 });
      const fastChannel = createMockChannel('fast', { delay: 10 });

      service.registerChannel(slowChannel);
      service.registerChannel(fastChannel);

      const start = Date.now();
      await service.info('Test', 'Message');
      const duration = Date.now() - start;

      // Should be closer to 50ms (slowest) not 60ms (sum)
      expect(duration).toBeLessThan(100);
      expect(slowChannel.sendMock).toHaveBeenCalledTimes(1);
      expect(fastChannel.sendMock).toHaveBeenCalledTimes(1);
    });
  });
});
