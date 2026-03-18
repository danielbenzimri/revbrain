import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: '../../supabase/migrations', // DIRECTLY to Supabase migrations
  driver: 'pg',
  dbCredentials: {
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres', // Default Supabase Local port
  },
} satisfies Config;
