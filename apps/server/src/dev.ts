// Load environment variables first (before any other imports)
import './lib/load-env.ts';

import { serve } from '@hono/node-server';
import { initSentry, flushSentry } from './lib/sentry.ts';
import app from './index.ts';

// Initialize Sentry before starting the server
await initSentry();

const server = serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);

// Graceful shutdown - flush Sentry events before exit
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await flushSentry();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await flushSentry();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
