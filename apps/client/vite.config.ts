import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle analysis — generates stats.html on build
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false, // Don't auto-open; view manually when needed
    }),
    // Pre-compress assets with gzip
    viteCompression({
      algorithm: 'gzip',
      threshold: 1024, // Only compress files > 1KB
    }),
    // Pre-compress assets with brotli (better compression)
    viteCompression({
      algorithm: 'brotliCompress',
      threshold: 1024,
      ext: '.br',
    }),
  ],
  // Load env files from monorepo root (single source of truth)
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
      // xlsx-js-style declares browser: { stream: false, fs: false } but Vite
      // still warns about externalized Node built-ins — alias to empty modules.
      stream: path.resolve(__dirname, 'src/lib/empty-module.ts'),
      fs: path.resolve(__dirname, 'src/lib/empty-module.ts'),
    },
  },
  define: {
    'process.env': {},
  },
  build: {
    rollupOptions: {
      // Suppress warnings for Node built-ins used by xlsx-js-style
      onwarn(warning, warn) {
        if (warning.message?.includes('Module "stream"')) return;
        if (warning.message?.includes('Module "fs"')) return;
        warn(warning);
      },
      output: {
        // Manual chunk splitting for optimal caching and load times
        manualChunks: {
          // React core - stable, rarely changes
          'react-vendor': ['react', 'react-dom'],
          // Data fetching - changes occasionally
          'query-vendor': ['@tanstack/react-query'],
          // UI components - changes occasionally
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-avatar',
            '@radix-ui/react-label',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            'lucide-react',
          ],
          // Charting - only needed for dashboards
          'chart-vendor': ['recharts'],
          // 3D/geo - only needed for specific modules
          'geo-vendor': ['three', 'leaflet', 'proj4'],
          // Forms - used widely but stable
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // i18n - stable runtime
          'i18n-vendor': ['i18next', 'react-i18next'],
        },
      },
    },
  },
});
