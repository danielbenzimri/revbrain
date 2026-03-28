/**
 * Worker configuration from environment variables.
 * Validates required values on startup — fails fast with clear error.
 *
 * See: docs/CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md Task 0.6
 */

export interface WorkerConfig {
  /** Assessment job identifier */
  jobId: string;
  /** Specific run identifier */
  runId: string;
  /** PostgreSQL connection string (scoped to extractor_worker role, sslmode=require) */
  databaseUrl: string;
  /** AES-256 master key for token decryption (base64) */
  salesforceTokenEncryptionKey: string;
  /** Supabase Storage API endpoint */
  supabaseStorageUrl: string;
  /** Supabase service role key (for storage uploads with app-layer path enforcement) */
  supabaseServiceRoleKey: string;
  /** Hono server URL for token refresh delegation */
  internalApiUrl: string;
  /** Shared secret for internal API auth */
  internalApiSecret: string;
  /** Correlation ID from trigger */
  traceId: string;
  /** Log level (default: info) */
  logLevel: string;
  /** Worker container image tag / git SHA */
  workerVersion: string;
  /** Enable LLM enrichment (executive summary, hotspot narratives, lifecycle) */
  llmEnrichmentEnabled: boolean;
  /** Anthropic API key (required if llmEnrichmentEnabled) */
  anthropicApiKey: string | null;
  /** Anthropic model override (default: claude-sonnet-4-20250514) */
  anthropicModel: string | null;
}

/**
 * Load and validate worker configuration from environment variables.
 * Throws with a clear message naming any missing required variable.
 */
export function loadConfig(): WorkerConfig {
  const required: Array<[string, string]> = [
    ['JOB_ID', 'Assessment job identifier'],
    ['RUN_ID', 'Specific run identifier'],
    ['DATABASE_URL', 'PostgreSQL connection string'],
    ['SALESFORCE_TOKEN_ENCRYPTION_KEY', 'AES-256 master key (base64)'],
    ['SUPABASE_STORAGE_URL', 'Supabase Storage API endpoint'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key'],
    ['INTERNAL_API_URL', 'Hono server URL for token refresh'],
    ['INTERNAL_API_SECRET', 'Shared secret for internal API auth'],
  ];

  const missing: string[] = [];
  for (const [name, desc] of required) {
    if (!process.env[name]) {
      missing.push(`${name} (${desc})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((m) => `  - ${m}`).join('\n')}`
    );
  }

  const databaseUrl = process.env.DATABASE_URL!;

  // Validate DATABASE_URL is a postgres:// URL
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    throw new Error(
      `DATABASE_URL must start with postgres:// or postgresql://, got: ${databaseUrl.substring(0, 20)}...`
    );
  }

  return {
    jobId: process.env.JOB_ID!,
    runId: process.env.RUN_ID!,
    databaseUrl,
    salesforceTokenEncryptionKey: process.env.SALESFORCE_TOKEN_ENCRYPTION_KEY!,
    supabaseStorageUrl: process.env.SUPABASE_STORAGE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    internalApiUrl: process.env.INTERNAL_API_URL!,
    internalApiSecret: process.env.INTERNAL_API_SECRET!,
    traceId: process.env.TRACE_ID ?? `trace-${Date.now()}`,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    workerVersion: process.env.WORKER_VERSION ?? 'dev',
    llmEnrichmentEnabled: process.env.LLM_ENRICHMENT_ENABLED === 'true',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? null,
  };
}
