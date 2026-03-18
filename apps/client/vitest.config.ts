import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      globals: false,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        exclude: [
          'node_modules/',
          'dist/',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.config.ts',
          'src/main.tsx',
          'src/vite-env.d.ts',
          'src/features/modules/legacy/**',
          'src/components/**',
          'src/features/**/pages/**',
          'src/features/**/components/**',
          'src/app/**',
          'src/locales/**',
        ],
      },
    },
  })
);
