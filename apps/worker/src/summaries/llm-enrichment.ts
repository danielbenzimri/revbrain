/**
 * LLM Enrichment Module — Optional narrative generation via Claude.
 *
 * Produces:
 * - Executive summary (5 key findings)
 * - Complexity hotspot narratives
 * - Quote lifecycle description
 *
 * Non-blocking: returns null on any error. Pipeline is valid without this.
 * Toggled via LLM_ENRICHMENT_ENABLED config flag.
 *
 * See: Gap Analysis §4, Completion Plan L-02
 */

import { z } from 'zod';
import type { SummarySchema } from './schemas.ts';
import type { CollectorResult } from '../collectors/base.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

const log = logger.child({ component: 'llm-enrichment' });

// ============================================================================
// Output Schema (Zod — runtime validation of LLM output)
// ============================================================================

const LLMEnrichmentSchema = z.object({
  executiveSummary: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string(),
        confidence: z.enum(['Confirmed', 'Estimated', 'Partial']),
      })
    )
    .min(1)
    .max(10),
  hotspotAnalyses: z.array(
    z.object({
      hotspotName: z.string(),
      severity: z.enum(['Critical', 'High', 'Medium']),
      analysis: z.string(),
    })
  ),
  lifecycleDescription: z.array(
    z.object({
      stepNumber: z.number().int().min(1).max(10),
      title: z.string(),
      detail: z.string(),
    })
  ),
});

export type LLMEnrichmentOutput = z.infer<typeof LLMEnrichmentSchema>;

// ============================================================================
// Main Function
// ============================================================================

export async function enrichWithLLM(opts: {
  apiKey: string;
  model?: string;
  summaries: SummarySchema;
  results: Map<string, CollectorResult>;
}): Promise<LLMEnrichmentOutput | null> {
  log.info('llm_enrichment_starting');

  // Dynamic import — avoids bundling Anthropic SDK when LLM is disabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;
  try {
    // @ts-expect-error — @anthropic-ai/sdk is an optional dependency
    const mod = await import('@anthropic-ai/sdk');
    const Anthropic = mod.default ?? mod.Anthropic;
    client = new Anthropic({ apiKey: opts.apiKey });
  } catch {
    log.warn('anthropic_sdk_not_installed: install @anthropic-ai/sdk to enable LLM enrichment');
    return null;
  }
  const input = buildLLMInput(opts.summaries, opts.results);
  const prompt = buildPrompt(input);

  // 30-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await client.messages.create(
      {
        model: opts.model ?? 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal }
    );

    const text = response.content?.[0]?.type === 'text' ? response.content[0].text : '';

    if (!text) {
      log.warn('llm_empty_response');
      return null;
    }

    // Parse + validate
    const parsed = JSON.parse(text);
    const validated = LLMEnrichmentSchema.parse(parsed);

    log.info(
      {
        summaryCount: validated.executiveSummary.length,
        hotspotCount: validated.hotspotAnalyses.length,
        lifecycleSteps: validated.lifecycleDescription.length,
      },
      'llm_enrichment_validated'
    );

    return validated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`llm_enrichment_failed: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Input Builder
// ============================================================================

interface LLMInput {
  overallScore: number;
  totalFindings: number;
  domainSummaries: Array<{
    domain: string;
    findingsCount: number;
    migrationReadiness: string;
    highlights: string[];
  }>;
  featureAdoption: Record<string, { used: boolean; level: string }>;
  criticalFindings: Array<{ name: string; notes: string; domain: string }>;
  highFindings: Array<{ name: string; notes: string; domain: string }>;
}

function buildLLMInput(summaries: SummarySchema, results: Map<string, CollectorResult>): LLMInput {
  // Collect critical + high findings
  const allFindings: AssessmentFindingInput[] = [];
  for (const [, result] of results) {
    allFindings.push(...result.findings);
  }

  const criticals = allFindings
    .filter((f) => f.riskLevel === 'critical')
    .slice(0, 5)
    .map((f) => ({ name: f.artifactName, notes: f.notes ?? '', domain: f.domain }));

  const highs = allFindings
    .filter((f) => f.riskLevel === 'high')
    .slice(0, 10)
    .map((f) => ({ name: f.artifactName, notes: f.notes ?? '', domain: f.domain }));

  return {
    overallScore: summaries.overallScore,
    totalFindings: summaries.totalFindings,
    domainSummaries: summaries.domainSummaries.map((d) => ({
      domain: d.domain,
      findingsCount: d.findingsCount,
      migrationReadiness: d.migrationReadiness,
      highlights: d.highlights.map((h) => `${h.label}: ${h.description}`),
    })),
    featureAdoption: {},
    criticalFindings: criticals,
    highFindings: highs,
  };
}

// ============================================================================
// Prompt Builder
// ============================================================================

function buildPrompt(input: LLMInput): string {
  return `You are a Salesforce CPQ migration analyst. Based on the following extraction data from a customer's Salesforce org, produce a structured assessment enrichment.

<extraction_data>
${JSON.stringify(input, null, 2)}
</extraction_data>

Output a JSON object matching this exact TypeScript interface:

interface LLMEnrichmentOutput {
  executiveSummary: Array<{
    id: string;           // "kf-1", "kf-2", etc.
    title: string;        // Short finding title
    detail: string;       // 2-3 sentence detail paragraph
    confidence: 'Confirmed' | 'Estimated' | 'Partial';
  }>;  // Exactly 5 findings, ordered by migration impact

  hotspotAnalyses: Array<{
    hotspotName: string;  // Must match a domain or known pattern
    severity: 'Critical' | 'High' | 'Medium';
    analysis: string;     // 2-3 sentences: WHY this area concentrates complexity + migration risk
  }>;

  lifecycleDescription: Array<{
    stepNumber: number;   // 1-7
    title: string;        // e.g., "Lead qualified → converted to Account, Contact, Opportunity"
    detail: string;       // Org-specific details
  }>;  // 5-7 steps from lead to order
}

Rules:
- Use ONLY data from the extraction. Do not invent metrics or features not present in the input.
- Executive summary findings must reference specific numbers from the data.
- Output ONLY the raw JSON object. No markdown code blocks, no preamble text, no explanation after the JSON.
- All output must be valid JSON parseable by JSON.parse().`;
}
