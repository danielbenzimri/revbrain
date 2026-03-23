#!/usr/bin/env npx tsx
/**
 * Edge Function Performance Benchmark
 *
 * Measures cold start and warm request latency against the staging edge function.
 * Run: npx tsx scripts/benchmark-edge.ts
 *
 * Requires: .env.stg with SUPABASE_URL and SUPABASE_ANON_KEY
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.stg') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.stg');
  process.exit(1);
}

const BASE = `${SUPABASE_URL}/functions/v1/api`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TimedResult {
  status: number;
  ms: number;
  ok: boolean;
}

async function timedFetch(url: string, headers?: Record<string, string>): Promise<TimedResult> {
  const start = performance.now();
  try {
    const res = await fetch(url, { headers });
    const ms = Math.round(performance.now() - start);
    return { status: res.status, ms, ok: res.ok };
  } catch {
    const ms = Math.round(performance.now() - start);
    return { status: 0, ms, ok: false };
  }
}

async function login(): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL!, ANON_KEY!);
  const { data, error } = await sb.auth.signInWithPassword({
    email: 'admin@revbrain.io',
    password: 'RevBrain-Dev-2026!',
  });
  if (error || !data.session) {
    console.error('Login failed:', error?.message);
    process.exit(1);
  }
  return data.session.access_token;
}

function pad(s: string, n: number): string {
  return s.padEnd(n);
}

function colorMs(ms: number): string {
  if (ms < 500) return `\x1b[32m${ms}ms\x1b[0m`; // green
  if (ms < 1500) return `\x1b[33m${ms}ms\x1b[0m`; // yellow
  return `\x1b[31m${ms}ms\x1b[0m`; // red
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const skipWait = args.includes('--skip-wait');
  const warmupSeconds = skipWait ? 0 : 90;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║    RevBrain Edge Function Performance Benchmark  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`  Target: ${BASE}`);
  console.log(`  Time:   ${new Date().toISOString()}\n`);

  // Step 1: Login
  console.log('  Authenticating...');
  const token = await login();
  const authHeaders = { Authorization: `Bearer ${token}` };
  console.log('  ✓ Logged in as admin@revbrain.io\n');

  // Step 2: Wait for cold start
  if (warmupSeconds > 0) {
    console.log(`  Waiting ${warmupSeconds}s for warm instances to expire...`);
    await new Promise((r) => setTimeout(r, warmupSeconds * 1000));
    console.log('');
  }

  // Step 3: Cold start — health (no auth)
  console.log('  ── Cold Start (unauthenticated) ──\n');
  const cold1 = await timedFetch(`${BASE}/v1/health`);
  console.log(`  ${pad('Health (cold)', 30)} ${colorMs(cold1.ms)}  HTTP ${cold1.status}`);

  const warm1 = await timedFetch(`${BASE}/v1/health`);
  console.log(`  ${pad('Health (warm)', 30)} ${colorMs(warm1.ms)}  HTTP ${warm1.status}`);

  const warm2 = await timedFetch(`${BASE}/v1/health`);
  console.log(`  ${pad('Health (warm 2)', 30)} ${colorMs(warm2.ms)}  HTTP ${warm2.status}`);

  // Step 4: Authenticated endpoints
  console.log('\n  ── Authenticated Endpoints ──\n');

  const endpoints: [string, string][] = [
    ['Plans (1st/cold auth)', '/v1/plans'],
    ['Plans (2nd/warm)', '/v1/plans'],
    ['Plans (3rd/warm)', '/v1/plans'],
    ['Auth/me', '/v1/auth/me'],
    ['Admin stats', '/v1/admin/stats'],
    ['Admin tenants', '/v1/admin/tenants'],
    ['Admin users', '/v1/admin/users'],
  ];

  const results: { name: string; ms: number; status: number }[] = [];

  for (const [name, path] of endpoints) {
    const r = await timedFetch(`${BASE}${path}`, authHeaders);
    results.push({ name, ms: r.ms, status: r.status });
    console.log(`  ${pad(name, 30)} ${colorMs(r.ms)}  HTTP ${r.status}`);
  }

  // Step 5: Summary
  const warmResults = results.slice(1); // skip first cold auth
  const avgWarm = Math.round(warmResults.reduce((s, r) => s + r.ms, 0) / warmResults.length);
  const p95 = warmResults.sort((a, b) => a.ms - b.ms)[Math.floor(warmResults.length * 0.95)]?.ms ?? 0;

  console.log('\n  ── Summary ──\n');
  console.log(`  Health cold start:    ${colorMs(cold1.ms)}`);
  console.log(`  Health warm avg:      ${colorMs(Math.round((warm1.ms + warm2.ms) / 2))}`);
  console.log(`  Auth endpoints avg:   ${colorMs(avgWarm)} (warm, excluding first cold auth)`);
  console.log(`  Auth endpoints p95:   ${colorMs(p95)}`);
  console.log(`  First auth cold:      ${colorMs(results[0].ms)}`);

  // Step 6: Pass/Fail thresholds
  console.log('\n  ── Thresholds ──\n');
  const checks = [
    { name: 'Health cold < 4s', pass: cold1.ms < 4000, value: cold1.ms },
    { name: 'Health warm < 1s', pass: warm2.ms < 1000, value: warm2.ms },
    { name: 'Auth warm avg < 3s', pass: avgWarm < 3000, value: avgWarm },
    { name: 'Auth warm p95 < 4s', pass: p95 < 4000, value: p95 },
  ];

  let allPass = true;
  for (const c of checks) {
    const icon = c.pass ? '✓' : '✗';
    const color = c.pass ? '\x1b[32m' : '\x1b[31m';
    console.log(`  ${color}${icon}\x1b[0m ${pad(c.name, 30)} (${c.value}ms)`);
    if (!c.pass) allPass = false;
  }

  console.log('');
  if (allPass) {
    console.log('  \x1b[32m✓ All performance thresholds met\x1b[0m\n');
  } else {
    console.log('  \x1b[31m✗ Some thresholds exceeded — investigate\x1b[0m\n');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Benchmark failed:', e);
  process.exit(1);
});
