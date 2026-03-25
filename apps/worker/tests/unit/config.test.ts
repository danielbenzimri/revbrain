import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config.ts';

describe('config', () => {
  const originalEnv = process.env;

  const validEnv = {
    JOB_ID: 'test-job',
    RUN_ID: 'test-run',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SALESFORCE_TOKEN_ENCRYPTION_KEY: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXM=',
    SUPABASE_STORAGE_URL: 'http://localhost:54321/storage/v1',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    INTERNAL_API_URL: 'http://localhost:3000/v1',
    INTERNAL_API_SECRET: 'test-secret',
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load valid config from environment', () => {
    Object.assign(process.env, validEnv);
    const config = loadConfig();
    expect(config.jobId).toBe('test-job');
    expect(config.runId).toBe('test-run');
    expect(config.databaseUrl).toBe('postgresql://user:pass@localhost:5432/db');
    expect(config.logLevel).toBe('info'); // default
    expect(config.workerVersion).toBe('dev'); // default
  });

  it('should throw with clear error for missing required vars', () => {
    // Only set some vars
    process.env.JOB_ID = 'test';
    process.env.RUN_ID = 'test';

    expect(() => loadConfig()).toThrowError(/Missing required environment variables/);
    expect(() => loadConfig()).toThrowError(/DATABASE_URL/);
    expect(() => loadConfig()).toThrowError(/SALESFORCE_TOKEN_ENCRYPTION_KEY/);
  });

  it('should throw for invalid DATABASE_URL', () => {
    Object.assign(process.env, validEnv);
    process.env.DATABASE_URL = 'mysql://wrong';
    expect(() => loadConfig()).toThrowError(/must start with postgres/);
  });

  it('should accept postgres:// prefix', () => {
    Object.assign(process.env, validEnv);
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    const config = loadConfig();
    expect(config.databaseUrl).toContain('postgres://');
  });

  it('should use defaults for optional vars', () => {
    Object.assign(process.env, validEnv);
    const config = loadConfig();
    expect(config.logLevel).toBe('info');
    expect(config.workerVersion).toBe('dev');
    expect(config.traceId).toMatch(/^trace-/); // auto-generated
  });

  it('should use explicit values for optional vars when set', () => {
    Object.assign(process.env, validEnv);
    process.env.LOG_LEVEL = 'debug';
    process.env.WORKER_VERSION = 'v1.0.0-abc123';
    process.env.TRACE_ID = 'custom-trace';
    const config = loadConfig();
    expect(config.logLevel).toBe('debug');
    expect(config.workerVersion).toBe('v1.0.0-abc123');
    expect(config.traceId).toBe('custom-trace');
  });
});
