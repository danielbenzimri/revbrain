/**
 * Database connection pools for the extraction worker.
 *
 * Two separate pools:
 * - Main pool (5 connections): used by collectors for reads/writes
 * - Heartbeat pool (1 connection): reserved for lease renewal, never contends
 *
 * Uses direct connections (not PgBouncer) because the extractor_worker
 * custom role can't authenticate through Supabase's connection pooler.
 *
 * SSL required. Connection-level statement_timeout = 60s.
 */

import postgres from 'postgres';

export interface DbPools {
  main: postgres.Sql;
  heartbeat: postgres.Sql;
}

export function createPools(databaseUrl: string): DbPools {
  const main = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const heartbeat = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return { main, heartbeat };
}

export async function closePools(pools: DbPools): Promise<void> {
  await Promise.all([pools.main.end(), pools.heartbeat.end()]);
}
