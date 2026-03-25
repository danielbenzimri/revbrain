/**
 * Summary schemas — type definitions for assessment summaries.
 *
 * These types define the structure of the summary JSON stored in
 * assessment_runs.summaries and consumed by the client UI and
 * LLM migration advisor.
 *
 * See: Extraction Spec — Summary schema definitions
 */

/** Overall assessment summary */
export interface SummarySchema {
  overallScore: number;
  domainSummaries: DomainSummary[];
  totalFindings: number;
  riskDistribution: RiskDistribution;
  generatedAt: string;
}

/** Per-domain summary */
export interface DomainSummary {
  domain: string;
  collectorName: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  findingsCount: number;
  riskDistribution: RiskDistribution;
  complexityDistribution: ComplexityDistribution;
  highlights: SummaryHighlight[];
  migrationReadiness: 'ready' | 'needs-work' | 'significant-effort' | 'unknown';
  coveragePercent: number;
}

/** Risk level counts */
export interface RiskDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

/** Complexity level counts */
export interface ComplexityDistribution {
  veryHigh?: number;
  high?: number;
  medium?: number;
  low?: number;
}

/** A notable highlight for a domain summary */
export interface SummaryHighlight {
  /** Short label (e.g., "Nested Bundles Detected") */
  label: string;
  /** Description for UI or LLM context */
  description: string;
  /** Severity for UI styling */
  severity: 'critical' | 'warning' | 'info';
}

// TODO: Add Zod schemas for runtime validation (move to @revbrain/contract)
// TODO: Add summary versioning for backwards compatibility
// TODO: Add LLM-optimized summary format (token-efficient representation)
