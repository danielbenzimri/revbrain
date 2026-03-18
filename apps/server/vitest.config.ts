import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/v1/routes/**', // Routes are thin wrappers, tested via E2E
        'src/repositories/**', // Repositories tested via services
        'src/lib/sentry.ts', // Integration code, tested manually
        'src/lib/stripe.ts', // External integration
        'src/middleware/logger.ts', // Logging middleware
        'src/middleware/cache.ts', // Simple caching
        'src/services/index.ts', // Re-exports only
        'src/services/middleware.ts', // Middleware helpers
      ],
      thresholds: {
        lines: 50,
        functions: 55,
        branches: 45,
        statements: 50,
      },
    },
  },
});
